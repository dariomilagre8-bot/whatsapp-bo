'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
    }
  };
}

function assert(c, m) {
  if (!c) throw new Error(m || 'fail');
}

console.log('\n🧪 TESTES — engine/learning/postBugHook\n');

(async () => {
  await (test('postBugHook appende CLAUDE e chama inserter', async () => {
    delete require.cache[require.resolve('../../../engine/learning/postBugHook')];
    const { postBugHook } = require('../../../engine/learning/postBugHook');
    const tmp = path.join(os.tmpdir(), `claude-test-${Date.now()}.md`);
    let inserted = false;
    await postBugHook(
      {
        bugId: '074',
        inputOriginal: 'texto teste',
        wrongIntent: 'COMPRA',
        correctIntent: 'CONSULTA_PRECO',
        clientId: 'streamzone',
      },
      {
        claudePath: tmp,
        addNegativeRule: async () => {
          inserted = true;
        },
      }
    );
    assert(inserted, 'inserter chamado');
    const body = fs.readFileSync(tmp, 'utf8');
    assert(body.includes('BUG-074'), 'linha BUG');
    assert(body.includes('texto teste'), 'input');
    fs.unlinkSync(tmp);
  }))();

  console.log(`\n📊 Resultado: ${passed} passou | ${failed} falhou`);
  if (failed) process.exit(1);
})();
