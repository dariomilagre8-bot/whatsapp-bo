'use strict';

async function waitForCompleted(queue, minCompleted = 1, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const c = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
    if (c.completed >= minCompleted && c.active === 0 && c.waiting === 0) return c;
    await new Promise((r) => setTimeout(r, 100));
  }
  const last = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
  throw new Error(`timeout aguardando jobs (completed=${last.completed})`);
}

module.exports = { waitForCompleted };
