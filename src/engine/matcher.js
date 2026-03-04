// src/engine/matcher.js
// Testa a mensagem contra todas as respostas fixas do config

function findMatch(message, fixedResponses, currentState) {
  const text = message.trim();

  for (const entry of fixedResponses) {
    // Se a resposta requer um estado específico e não estamos nele, skip
    if (entry.requireState && entry.requireState !== currentState) {
      continue;
    }

    for (const pattern of entry.patterns) {
      // Reset lastIndex para regex com flag g
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
