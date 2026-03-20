'use strict';

const {
  trackPausedChat,
  getMostRecentPaused,
  removePausedChat,
  _clearAll,
} = require('../engine/utils/paused-chats-tracker');

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

console.log('\n🧪 paused-chats-tracker util');

_clearAll();

test('retorna o mais recente por timestamp', () => {
  trackPausedChat('111', '222', 1000);
  trackPausedChat('111', '333', 2000);
  assert(getMostRecentPaused('111') === '333', 'expected 333 most recent');
});

test('removePausedChat remove o chat específico', () => {
  removePausedChat('111', '333');
  assert(getMostRecentPaused('111') === '222', 'expected 222 after removal');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);

