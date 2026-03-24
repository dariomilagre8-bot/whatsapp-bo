'use strict';

jest.mock('../../alerts/notifyDon', () => ({ notifyDon: jest.fn().mockResolvedValue() }));
jest.mock('../../queue/deadLetterQueue', () => ({ addDeadLetter: jest.fn().mockResolvedValue() }));

const mq = require('../../queue/messageQueue');
const { getTestRedis, flushTestRedis, closeRedis } = require('./helpers/redisTest');
const { shutdownPaQueue } = require('./helpers/queueShutdown');
const { waitForCompleted } = require('./helpers/waitQueue');

const runInt = process.env.REDIS_URL ? describe : describe.skip;

runInt('queue → orchestrator (handler)', () => {
  let redis;

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

  it('worker processa job e invoca handler com traceId e clientSlug', async () => {
    const spy = jest.fn().mockResolvedValue();
    const reg = {
      InstX: {
        config: { slug: 'slug-x', evolutionInstance: 'InstX' },
        handler: spy,
      },
    };
    mq.createQueue();
    mq.createWorker(reg);
    const q = mq.getQueue();
    await mq.addMessage({
      body: { ping: true },
      instanceName: 'InstX',
      traceId: 'trace-orq',
      clientSlug: 'slug-x',
    });
    await waitForCompleted(q, 1);
    expect(spy).toHaveBeenCalledTimes(1);
    const req = spy.mock.calls[0][0];
    expect(req.traceId).toBe('trace-orq');
    expect(req.clientSlug).toBe('slug-x');
    expect(req.body).toEqual({ ping: true });
    expect(req.clientConfig.slug).toBe('slug-x');
  });
});
