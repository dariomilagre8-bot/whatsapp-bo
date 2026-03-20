'use strict';

const { parseJid, resolveNumber } = require('../engine/utils/resolve-number');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      // async
      return res.then(() => {
        console.log(`  ✅ ${name}`);
        passed++;
      }).catch((err) => {
        console.log(`  ❌ ${name}: ${err.message}`);
        failed++;
      });
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

async function run() {
  console.log('\n🧪 resolve-number util');

  test('parseJid identifica LID (@lid)', () => {
    const p = parseJid('251371634868240@lid');
    assert(p.isLid === true, 'expected isLid=true');
    assert(p.number === '251371634868240', 'expected lid digits');
  });

  test('parseJid normal (não LID)', () => {
    const p = parseJid('244946014060@s.whatsapp.net');
    assert(p.isLid === false, 'expected isLid=false');
    assert(p.number === '244946014060', 'expected phone digits');
  });

  await test('resolveNumber não-LID retorna número normalizado', async () => {
    const resolved = await resolveNumber(
      '244946014060@s.whatsapp.net',
      'any-instance',
      { apiUrl: 'http://invalid', apiKey: 'x' }
    );
    assert(resolved === '244946014060', `expected 244946014060, got ${resolved}`);
  });

  await test('resolveNumber LID sem evolutionConfig falha rápido e faz fallback', async () => {
    const resolved = await resolveNumber('251371634868240@lid', 'demo-moda', {});
    assert(resolved === '251371634868240', `expected lid digits fallback, got ${resolved}`);
  });

  console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();

