// engine/queue/deadLetterQueue.js — Dead Letter Queue para mensagens que falharam 3x
// Armazena para análise/re-processamento manual. Monitorizar: LLEN bull:pa-dead-letters:wait

'use strict';

const { Queue } = require('bullmq');
const { createLogger } = require('../lib/logger');

const DLQ_NAME = 'pa-dead-letters';
const logger = createLogger(null, 'engine', 'dead-letter-queue');

let _dlq = null;

/** Extrai opções de conexão Redis compatíveis com BullMQ. */
function parseRedisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('[DLQ] REDIS_URL não configurado no ambiente');
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

/** Cria (ou devolve existente) a Dead Letter Queue. */
function createDLQ() {
  if (_dlq) return _dlq;
  const connection = parseRedisConnection();
  _dlq = new Queue(DLQ_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: false,
      removeOnFail: false,
    },
  });
  logger.info('DLQ criada', { name: DLQ_NAME });
  return _dlq;
}

/**
 * Adiciona uma mensagem falhada à Dead Letter Queue.
 * @param {{ originalMessage: object, errorStack: string, timestamp: string, clientId: string }} params
 */
async function addDeadLetter({ originalMessage, errorStack, timestamp, clientId }) {
  const q = createDLQ();
  const job = await q.add('dead-letter', {
    originalMessage,
    errorStack,
    timestamp,
    clientId,
  });
  logger.warn('mensagem enviada para DLQ', {
    jobId: job.id,
    clientId,
    timestamp,
  });
  return job;
}

function getDLQ() { return _dlq; }

/** Reset para testes (não usar em produção). */
function _reset() { _dlq = null; }

module.exports = { createDLQ, addDeadLetter, getDLQ, _reset };
