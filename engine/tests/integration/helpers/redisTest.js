'use strict';

const Redis = require('ioredis');

async function getTestRedis(url = process.env.REDIS_URL) {
  if (!url) throw new Error('REDIS_URL em falta para testes de integração');
  const r = new Redis(url, { maxRetriesPerRequest: null });
  await r.ping();
  return r;
}

async function flushTestRedis(r) {
  await r.flushdb();
}

async function closeRedis(r) {
  if (r) await r.quit();
}

module.exports = { getTestRedis, flushTestRedis, closeRedis };
