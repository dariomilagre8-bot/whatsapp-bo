// engine/queue/messageQueue.js — BullMQ queue + worker para processamento assíncrono de mensagens
// Webhook → queue.add() → worker → handler (concurrency:1, retry 3x, backoff custom)

'use strict';

const { Queue, Worker } = require('bullmq');
const { createLogger } = require('../lib/logger');
const { notifyDon } = require('../alerts/notifyDon');
const { addDeadLetter } = require('./deadLetterQueue');

const QUEUE_NAME = 'pa-messages';
const MAX_ATTEMPTS = 3;
const BACKOFF_DELAYS = [1000, 5000, 30000]; // ms por tentativa

const logger = createLogger(null, 'engine', 'message-queue');

let _queue = null;
let _worker = null;

/** Extrai { host, port, password } do REDIS_URL para BullMQ (requer maxRetriesPerRequest: null). */
function parseRedisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('[QUEUE] REDIS_URL não configurado no ambiente');
  const u = new URL(url);
  const conn = {
    host: u.hostname,
    port: parseInt(u.port, 10) || 6379,
    maxRetriesPerRequest: null,
  };
  if (u.password) conn.password = decodeURIComponent(u.password);
  if (u.username && u.username !== 'default') conn.username = u.username;
  return conn;
}

/** Cria (ou devolve existente) a Queue 'pa-messages'. */
function createQueue() {
  if (_queue) return _queue;
  const connection = parseRedisConnection();
  _queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'custom' },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
  logger.info('Queue criada', { name: QUEUE_NAME });
  return _queue;
}

/**
 * Cria (ou devolve existente) o Worker que processa mensagens do registry.
 * @param {Object} registry - Mapa instanceName → { config, handler }
 */
function createWorker(registry) {
  if (_worker) return _worker;
  const connection = parseRedisConnection();

  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { body, instanceName, traceId, clientSlug } = job.data;
      const entry = registry[instanceName];
      if (!entry) throw new Error(`Instância "${instanceName}" não encontrada no registry`);

      const mockReq = { body, traceId, clientSlug, clientConfig: entry.config };
      const mockRes = {
        headersSent: true,
        status: () => ({ send: () => {}, json: () => {} }),
        json: () => {},
      };
      await entry.handler(mockReq, mockRes);
    },
    {
      connection,
      concurrency: 1,
      settings: {
        backoffStrategy: (attemptsMade) =>
          BACKOFF_DELAYS[Math.min(attemptsMade - 1, BACKOFF_DELAYS.length - 1)],
      },
    }
  );

  _worker.on('completed', (job) => {
    logger.info('job concluído', { jobId: job.id, clientSlug: job.data.clientSlug });
  });

  _worker.on('failed', async (job, err) => {
    const isFinal = job.attemptsMade >= MAX_ATTEMPTS;
    logger.error('job falhou', {
      jobId: job.id,
      attempt: job.attemptsMade,
      final: isFinal,
      error: err.message,
    });
    if (isFinal) {
      await addDeadLetter({
        originalMessage: job.data,
        errorStack: err.stack || err.message,
        timestamp: new Date().toISOString(),
        clientId: job.data.clientSlug,
      }).catch((e) => logger.error('addDeadLetter falhou', { error: e.message }));

      await notifyDon(job.data.clientSlug || 'unknown', err.message).catch((e) =>
        logger.error('notifyDon falhou', { error: e.message })
      );
    }
  });

  _worker.on('stalled', (jobId) => {
    logger.warn('job stalled (timeout worker)', { jobId });
  });

  logger.info('Worker iniciado', { name: QUEUE_NAME, concurrency: 1 });
  return _worker;
}

/** Adiciona mensagem à queue. Payload deve ser JSON-serializável. */
async function addMessage(payload) {
  const q = createQueue();
  return q.add('process-message', payload);
}

function getQueue() { return _queue; }
function getWorker() { return _worker; }

/** Reset para testes (não usar em produção). */
function _reset() { _queue = null; _worker = null; }

module.exports = { createQueue, createWorker, addMessage, getQueue, getWorker, _reset };
