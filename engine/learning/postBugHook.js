// engine/learning/postBugHook.js — após correcção de bug de intent: Supabase + append CLAUDE.md

'use strict';

const fs = require('fs');
const path = require('path');
const { addNegativeRule } = require('./negativeRules');

function defaultClaudePath() {
  return path.join(__dirname, '..', '..', 'CLAUDE.md');
}

function normalizeBugId(bugId) {
  const s = String(bugId || '').trim().replace(/^BUG-?/i, '');
  return s || 'XXX';
}

async function postBugHook(payload, options = {}) {
  const { bugId, inputOriginal, wrongIntent, correctIntent, clientId } = payload;
  const inserter = options.addNegativeRule || addNegativeRule;
  await inserter(clientId || null, {
    input_pattern: inputOriginal,
    wrong_intent: wrongIntent,
    correct_intent: correctIntent,
    bug_id: bugId != null ? String(bugId) : null,
  });
  const bug = normalizeBugId(bugId);
  const line = `- BUG-${bug}: Input '${inputOriginal}' NÃO é ${wrongIntent}, é ${correctIntent} (regra negativa adicionada)\n`;
  const target = options.claudePath || defaultClaudePath();
  await fs.promises.appendFile(target, line, 'utf8');
}

module.exports = { postBugHook, defaultClaudePath, normalizeBugId };
