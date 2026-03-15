// engine/lib/matcher.js — Testa mensagem contra respostas fixas do config

function findMatch(message, fixedResponses, currentState) {
  const text = message.trim();

  for (const entry of fixedResponses) {
    if (entry.requireState && entry.requireState !== currentState) {
      continue;
    }

    for (const pattern of entry.patterns) {
      if (pattern.global) pattern.lastIndex = 0;
      if (pattern.test(text)) {
        console.log(`[MATCH] "${text}" → ${entry.id} (state: ${currentState})`);
        return entry;
      }
    }
  }

  return null;
}

module.exports = { findMatch };
