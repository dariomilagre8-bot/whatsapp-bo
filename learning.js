#!/usr/bin/env node
// node learning.js --add-rule --bug=074 --input="…" --wrong=COMPRA --correct=CONSULTA_PRECO --client=streamzone

require('dotenv').config();
const { postBugHook } = require('./engine/learning/postBugHook');

function arg(name) {
  const pre = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pre));
  return hit ? hit.slice(pre.length).replace(/^["']|["']$/g, '') : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  if (!hasFlag('add-rule')) {
    console.log('Uso: node learning.js --add-rule --bug=074 --input="texto" --wrong=COMPRA --correct=CONSULTA_PRECO [--client=streamzone]');
    process.exit(1);
  }
  const bug = arg('bug');
  const input = arg('input');
  const wrong = arg('wrong');
  const correct = arg('correct');
  const client = arg('client');
  if (!input || !wrong || !correct) {
    console.error('Faltam --input, --wrong ou --correct');
    process.exit(1);
  }
  await postBugHook({
    bugId: bug || null,
    inputOriginal: input,
    wrongIntent: wrong,
    correctIntent: correct,
    clientId: client || null,
  });
  console.log('[learning] Regra negativa registada e CLAUDE.md actualizado.');
}

main().catch((e) => {
  console.error('[learning]', e.message || e);
  process.exit(1);
});
