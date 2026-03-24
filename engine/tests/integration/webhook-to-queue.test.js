'use strict';

const { createWebhookRouter } = require('../../middleware/webhook-router');
const mq = require('../../queue/messageQueue');
const { getTestRedis, flushTestRedis, closeRedis } = require('./helpers/redisTest');
const { shutdownPaQueue } = require('./helpers/queueShutdown');
const { evolutionBody } = require('./helpers/evolutionPayload');
const { waitForCompleted } = require('./helpers/waitQueue');

const runInt = process.env.REDIS_URL ? describe : describe.skip;

runInt('webhook → queue', () => {
  let redis;

  function setupQueueAndWorker(spy) {
    const reg = {
      TestEvolution: {
        config: { slug: 'sz-test', evolutionInstance: 'TestEvolution' },
        handler: spy,
      },
    };
    const q = mq.createQueue();
    mq.createWorker(reg);
    return { reg, q };
  }

  beforeAll(async () => {
    redis = await getTestRedis();
  });
  beforeEach(async () => {
    await flushTestRedis(redis);
    await shutdownPaQueue(mq);
  });
  afterEach(async () => {
    await shutdownPaQueue(mq);
  });
  afterAll(async () => {
    await closeRedis(redis);
  });

  it('HTTP 200 imediato e 1 job completado na pa-messages', async () => {
    const spy = jest.fn().mockResolvedValue();
    const { reg, q } = setupQueueAndWorker(spy);
    const router = createWebhookRouter(reg, redis, q);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await router(
      { body: evolutionBody('oi', '244911111111@s.whatsapp.net', 'wa-id-1') },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    await waitForCompleted(q, 1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('mesmo data.key.id duas vezes: dedup → handler uma vez', async () => {
    const spy = jest.fn().mockResolvedValue();
    const { reg, q } = setupQueueAndWorker(spy);
    const router = createWebhookRouter(reg, redis, q);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const body = evolutionBody('x', '244922222222@s.whatsapp.net', 'dup-same');
    await router({ body }, res);
    await router({ body }, res);
    await waitForCompleted(q, 1);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
