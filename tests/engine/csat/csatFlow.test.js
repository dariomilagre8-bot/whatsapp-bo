'use strict';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(c, m) {
  if (!c) throw new Error(m || 'fail');
}

const {
  parseCsatDigit,
  bumpInboundCancelCsatSchedule,
} = require('../../../engine/csat/csatFlow');

console.log('\n🧪 TESTES — engine/csat/csatFlow\n');

test('parseCsatDigit aceita 1–5', () => {
  assert(parseCsatDigit('3') === 3);
  assert(parseCsatDigit(' 5 ') === 5);
});

test('parseCsatDigit ignora lixo', () => {
  assert(parseCsatDigit('ok') === null);
  assert(parseCsatDigit('10') === null);
  assert(parseCsatDigit('') === null);
});

test('bumpInboundCancelCsatSchedule limpa timer', () => {
  const session = {};
  session._csatSendTimer = setTimeout(() => {}, 60_000);
  bumpInboundCancelCsatSchedule(session);
  assert(session._csatSendTimer === null);
});

test('bumpInboundCancelCsatSchedule sem timer é no-op', () => {
  bumpInboundCancelCsatSchedule({});
});

console.log(`\n📊 csatFlow: ${passed} ok, ${failed} falharam\n`);
if (failed) process.exit(1);
