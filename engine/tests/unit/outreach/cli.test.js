// engine/tests/unit/outreach/cli.test.js

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => {
          console.log(`  ✅ ${name}`);
          passed++;
        },
        (err) => {
          console.log(`  ❌ ${name}: ${err.message}`);
          failed++;
        }
      );
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
  return Promise.resolve();
}

function assert(c, m) {
  if (!c) throw new Error(m || 'fail');
}

const { run, parseArgs, buildPrepareInsert } = require('../../../outreach/cli');

console.log('\n🧪 outreach cli\n');

async function runAll() {
  await test('parseArgs prepare + lead + niche', () => {
    const a = parseArgs(['--prepare', '--lead=Crocs Luanda', '--niche=ecommerce', '--pessoa=João', '--template=A']);
    assert(a.cmd === 'prepare');
    assert(a.lead === 'Crocs Luanda');
    assert(a.niche === 'ecommerce');
    assert(a.pessoa === 'João');
  });

  await test('buildPrepareInsert gera texto e meta', () => {
    const row = buildPrepareInsert({
      lead: 'Crocs Luanda',
      niche: 'ecommerce',
      pessoa: 'João',
      template: 'A',
      servico: '',
      phone: null,
    });
    assert(row.status === 'prepared');
    assert(row.lead_name === 'Crocs Luanda');
    assert(row.template_used === 'A');
    assert(row.message_text.includes('Don'));
    assert(row.message_text.includes('João'));
    assert(row.notes.includes('João'));
  });

  await test('--prepare com mock insertPrepared', async () => {
    const saved = [];
    const mock = {
      async insertPrepared(row) {
        saved.push(row);
        return { id: '00000000-0000-0000-0000-000000000001' };
      },
    };
    await run(
      ['--prepare', '--lead=BabyCity Angola', '--niche=ecommerce', '--pessoa=Maria', '--template=B'],
      mock
    );
    assert(saved.length === 1);
    assert(saved[0].lead_name === 'BabyCity Angola');
    assert(saved[0].message_text.includes('vídeo'));
  });

  await test('--sent actualiza via markSent', async () => {
    let called = null;
    const mock = {
      async markSent(lead) {
        called = lead;
      },
    };
    await run(['--sent', '--lead=Crocs Luanda'], mock);
    assert(called === 'Crocs Luanda');
  });

  await test('--replied chama markReplied com response', async () => {
    let payload = null;
    const mock = {
      async markReplied(lead, response) {
        payload = { lead, response };
      },
    };
    await run(['--replied', '--lead=X', '--response=Sim'], mock);
    assert(payload.lead === 'X' && payload.response === 'Sim');
  });
}

runAll().then(() => {
  if (failed) process.exit(1);
  console.log(`\n${passed} ok\n`);
});
