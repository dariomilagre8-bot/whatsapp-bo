'use strict';

// engine/utils/paused-chats-tracker.js
// Tracker in-memory para permitir "#retomar" sem número:
// devolve o chat pausado mais recente daquele supervisor.

const pausedBySupervisor = new Map(); // supNumber -> [{ clientNumber, ts }]

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function trackPausedChat(supervisorNumber, clientNumber, ts = Date.now()) {
  const sup = normalizeDigits(supervisorNumber);
  const client = normalizeDigits(clientNumber);
  if (!sup || !client) return;

  const list = pausedBySupervisor.get(sup) || [];
  list.push({ clientNumber: client, ts });
  pausedBySupervisor.set(sup, list);
}

function getMostRecentPaused(supervisorNumber) {
  const sup = normalizeDigits(supervisorNumber);
  if (!sup) return null;

  const list = pausedBySupervisor.get(sup) || [];
  if (list.length === 0) return null;

  let best = list[0];
  for (const item of list) {
    if (item.ts > best.ts) best = item;
  }
  return best.clientNumber;
}

function removePausedChat(supervisorNumber, clientNumber) {
  const sup = normalizeDigits(supervisorNumber);
  const client = normalizeDigits(clientNumber);
  if (!sup || !client) return;

  const list = pausedBySupervisor.get(sup) || [];
  const next = list.filter((x) => String(x.clientNumber) !== client);
  pausedBySupervisor.set(sup, next);
}

// Só para testes
function _clearAll() {
  pausedBySupervisor.clear();
}

module.exports = {
  trackPausedChat,
  getMostRecentPaused,
  removePausedChat,
  _clearAll,
};

