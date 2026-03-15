// engine/evals/run-eval.js — npm run eval: corre personas contra client(s), output tabela, exit 1 se falha

const path = require('path');
const personas = require('./personas');
const { simulate } = require('./simulator');
const { evaluate } = require('./judge');

const clientsDir = path.join(__dirname, '../../clients');
let clientConfigs = [];

try {
  const streamzone = require('../../clients/streamzone/config');
  clientConfigs = [{ slug: 'streamzone', config: streamzone }];
} catch (e) {
  console.warn('Nenhum client carregado:', e.message);
}

async function run() {
  let failed = 0;
  const results = [];

  for (const { slug, config } of clientConfigs) {
    for (const [key, persona] of Object.entries(personas)) {
      const { transcript } = await simulate(persona, config, 8);
      const { aggregate, pass, failures } = evaluate(transcript, config);
      results.push({ slug, persona: persona.name, aggregate, pass, failures });
      if (!pass) failed++;
    }
  }

  console.log('\n📊 EVALS — Palanca Bot Engine\n');
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`${icon} ${r.slug} / ${r.persona}: ${r.aggregate} ${r.pass ? '' : r.failures.join('; ')}`);
  }
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
