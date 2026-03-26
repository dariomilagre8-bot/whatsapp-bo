// tests/engine/infraRecipients.test.js
const {
  getInfraAlertRecipientsFromEnv,
  isLikelyRealMsisdn,
  DEFAULT_BOSS,
} = require('../../engine/lib/infraRecipients');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

console.log('\n📋 infraRecipients (BOSS_NUMBER, anti-LID):');

test('isLikelyRealMsisdn: Angola 12 dígitos OK', () => {
  assert(isLikelyRealMsisdn('244941713216') === true);
});

test('isLikelyRealMsisdn: LID 15 dígitos rejeitado', () => {
  assert(isLikelyRealMsisdn('251371634868240') === false);
});

test('getInfraAlertRecipientsFromEnv: BOSS_NUMBER com LID no CSV ignora LID', () => {
  const b = process.env.BOSS_NUMBER;
  const a = process.env.ALERT_PHONE;
  try {
    process.env.BOSS_NUMBER = '244941713216,251371634868240';
    delete process.env.ALERT_PHONE;
    const list = getInfraAlertRecipientsFromEnv();
    assert(list.length === 1 && list[0] === '244941713216', JSON.stringify(list));
  } finally {
    restoreEnv('BOSS_NUMBER', b);
    restoreEnv('ALERT_PHONE', a);
  }
});

test('getInfraAlertRecipientsFromEnv: só LIDs inválidos → fallback Don', () => {
  const b = process.env.BOSS_NUMBER;
  const a = process.env.ALERT_PHONE;
  try {
    process.env.BOSS_NUMBER = '251371634868240';
    delete process.env.ALERT_PHONE;
    const list = getInfraAlertRecipientsFromEnv();
    assert(list.length === 1 && list[0] === DEFAULT_BOSS, JSON.stringify(list));
  } finally {
    restoreEnv('BOSS_NUMBER', b);
    restoreEnv('ALERT_PHONE', a);
  }
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
