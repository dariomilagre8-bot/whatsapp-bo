// engine/lib/dedup.js — Idempotência: SETNX message_id TTL 24h
// Resolve duplicações reais em redes angolanas. Redis ou fallback em memória.

const DEDUP_TTL_SEC = 86400; // 24h

let redisClient = null;
const memoryStore = new Map(); // key -> expiry (timestamp)

function getRedis() {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    const Redis = require('ioredis');
    redisClient = new Redis(url);
  } catch (err) {
    console.warn('[DEDUP] ioredis não disponível, usando memória:', err.message);
    redisClient = null;
  }
  return redisClient;
}

function memorySetNX(key, ttlSec) {
  const now = Date.now();
  for (const [k, exp] of memoryStore) {
    if (exp < now) memoryStore.delete(k);
  }
  if (memoryStore.has(key)) return null;
  memoryStore.set(key, now + ttlSec * 1000);
  return '1';
}

/**
 * @param {object} redis - Cliente Redis (ou null para memória)
 * @param {string} messageId - ID único da mensagem (ex: data.key.id)
 * @param {string} clientSlug - Slug do cliente (ex: streamzone)
 * @returns {Promise<boolean>} true se for duplicado (deve ignorar), false se for nova
 */
async function isDuplicate(redis, messageId, clientSlug) {
  if (!messageId) return false;
  const key = `dedup:${clientSlug}:${messageId}`;

  const r = redis || getRedis();
  if (r) {
    try {
      const result = await r.set(key, '1', 'EX', DEDUP_TTL_SEC, 'NX');
      return result === null; // null = já existia = duplicado
    } catch (err) {
      console.warn('[DEDUP] Redis error, permitindo mensagem:', err.message);
      return false;
    }
  }

  const result = memorySetNX(key, DEDUP_TTL_SEC);
  return result === null;
}

module.exports = { isDuplicate, getRedis };
