'use strict';

const { isDuplicate } = require('../../lib/dedup');
const { getTestRedis, flushTestRedis, closeRedis } = require('./helpers/redisTest');

const runInt = process.env.REDIS_URL ? describe : describe.skip;

runInt('dedup Redis (message id)', () => {
  let redis;

  beforeAll(async () => {
    redis = await getTestRedis();
  });
  beforeEach(() => flushTestRedis(redis));
  afterAll(async () => {
    await closeRedis(redis);
  });

  it('duas entregas com o mesmo id: só a primeira passa', async () => {
    const mid = 'evolution-msg-42';
    expect(await isDuplicate(redis, mid, 'tenant-a')).toBe(false);
    expect(await isDuplicate(redis, mid, 'tenant-a')).toBe(true);
  });

  it('ids distintos: ambos novos', async () => {
    expect(await isDuplicate(redis, 'id-1', 'tenant-a')).toBe(false);
    expect(await isDuplicate(redis, 'id-2', 'tenant-a')).toBe(false);
  });
});
