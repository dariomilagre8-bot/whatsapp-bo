'use strict';

async function shutdownPaQueue(mq) {
  const { getQueue, getWorker, _reset } = mq;
  const w = getWorker();
  const q = getQueue();
  try {
    if (w && typeof w.close === 'function') await w.close();
  } catch (_) { /* ignore */ }
  try {
    if (q && typeof q.close === 'function') await q.close();
  } catch (_) { /* ignore */ }
  _reset();
}

module.exports = { shutdownPaQueue };
