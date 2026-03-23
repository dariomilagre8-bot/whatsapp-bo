// engine/lib/health.js — Health check com cache de 30s (Evolution, Supabase, Redis)

const os = require('os');
const packageJson = require('../../package.json');

let cachedHealth = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30000;

async function checkEvolution(evolutionUrl, apiKey, instanceName) {
  try {
    const start = Date.now();
    const res = await fetch(`${evolutionUrl.replace(/\/$/, '')}/instance/connectionState/${instanceName}`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    const open = data?.instance?.state === 'open';
    return {
      status: open ? 'ok' : 'degraded',
      instance: instanceName,
      connected: open,
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    return { status: 'error', instance: instanceName, connected: false, error: e.message, latency_ms: -1 };
  }
}

async function checkSupabase(supabaseUrl, supabaseKey) {
  try {
    const start = Date.now();
    const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: res.ok ? 'ok' : 'error',
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    return { status: 'error', error: e.message, latency_ms: -1 };
  }
}

async function checkRedis(redisClient) {
  try {
    const start = Date.now();
    await redisClient.ping();
    return { status: 'ok', latency_ms: Date.now() - start };
  } catch (e) {
    return { status: 'error', error: e.message, latency_ms: -1 };
  }
}

/**
 * @param {object} dependencies
 * @param {string} [dependencies.evolutionUrl]
 * @param {string} [dependencies.apiKey]
 * @param {string} [dependencies.instanceName]
 * @param {string} [dependencies.supabaseUrl]
 * @param {string} [dependencies.supabaseKey]
 * @param {import('ioredis').Redis | null} [dependencies.redisClient]
 * @param {object} [dependencies.clientConfig]
 */
async function getHealth(dependencies) {
  const now = Date.now();
  if (cachedHealth && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedHealth;
  }

  const [evolution, supabase, redis] = await Promise.allSettled([
    dependencies.evolutionUrl && dependencies.apiKey && dependencies.instanceName
      ? checkEvolution(dependencies.evolutionUrl, dependencies.apiKey, dependencies.instanceName)
      : Promise.resolve({ status: 'not_configured', connected: false }),
    dependencies.supabaseUrl && dependencies.supabaseKey
      ? checkSupabase(dependencies.supabaseUrl, dependencies.supabaseKey)
      : Promise.resolve({ status: 'not_configured' }),
    dependencies.redisClient ? checkRedis(dependencies.redisClient) : Promise.resolve({ status: 'not_configured' }),
  ]);

  const checks = {
    evolution: evolution.status === 'fulfilled' ? evolution.value : { status: 'error', error: 'check failed' },
    supabase: supabase.status === 'fulfilled' ? supabase.value : { status: 'error', error: 'check failed' },
    redis: redis.status === 'fulfilled' ? redis.value : { status: 'error', error: 'check failed' },
  };

  let status = 'healthy';
  if (checks.evolution.status === 'error') status = 'unhealthy';
  else if (checks.supabase.status === 'error' || checks.redis.status === 'error') status = 'degraded';

  Object.values(checks).forEach((c) => {
    if (c.latency_ms > 5000) status = status === 'healthy' ? 'degraded' : status;
  });

  const clientCfg = dependencies.clientConfig || {};
  const result = {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    checks,
    client: {
      slug: clientCfg.clientSlug || clientCfg.slug || 'unknown',
      instance: dependencies.instanceName,
      botName: (clientCfg.identity && clientCfg.identity.botName) || clientCfg.botName || 'unknown',
    },
    system: {
      memory_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      memory_total_mb: Math.round(os.totalmem() / 1024 / 1024),
      node_version: process.version,
    },
    version: packageJson.version || '2.0.0',
    environment: process.env.NODE_ENV || 'development',
  };

  cachedHealth = result;
  cacheTimestamp = now;
  return result;
}

module.exports = { getHealth };
