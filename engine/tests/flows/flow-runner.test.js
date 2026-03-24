'use strict';

const scenarios = require('./scenarios.json');
const { detectIntent } = require('../../../src/engine/intentDetector');
const { intentMatches } = require('./flowSemantic');
const { mockGenerateReply } = require('./mockGenerate');

const RUNS = 5;
const THRESHOLD = 0.8;

function runScenarioOnce(sc) {
  const history = [];
  let lastIntent;
  let lastReply = '';
  for (const input of sc.inputs) {
    const { intent } = detectIntent({ text: input, clientSlug: 'streamzone' });
    lastIntent = intent;
    lastReply = mockGenerateReply(input, history);
    history.push({ role: 'user', text: input }, { role: 'assistant', text: lastReply });
  }
  if (!intentMatches(sc, lastIntent)) return { ok: false };
  const low = lastReply.toLowerCase();
  for (const s of sc.response_must_contain || []) {
    if (!low.includes(String(s).toLowerCase())) return { ok: false };
  }
  for (const s of sc.response_must_not_contain || []) {
    if (low.includes(String(s).toLowerCase())) return { ok: false };
  }
  return { ok: true };
}

describe('flow-runner (scenarios.json ×5 consistência ≥80%)', () => {
  const summary = { pass: 0, fail: 0, rateSum: 0 };

  afterAll(() => {
    const n = scenarios.length;
    const avg = n ? ((summary.rateSum / n) * 100).toFixed(1) : '0';
    // eslint-disable-next-line no-console
    console.log(`\n[QA FLOWS] total=${n} passed=${summary.pass} failed=${summary.fail} consistência_média=${avg}%\n`);
  });

  for (const sc of scenarios) {
    it(sc.id, () => {
      let ok = 0;
      for (let i = 0; i < RUNS; i++) if (runScenarioOnce(sc).ok) ok++;
      const rate = ok / RUNS;
      summary.rateSum += rate;
      const pct = (rate * 100).toFixed(0);
      const tag = rate >= THRESHOLD ? 'PASS' : 'FAIL';
      // eslint-disable-next-line no-console
      console.log(`Cenário ${sc.id}: ${ok}/${RUNS} (${pct}%) — ${tag}`);
      if (rate >= THRESHOLD) summary.pass++;
      else summary.fail++;
      expect(rate).toBeGreaterThanOrEqual(THRESHOLD);
    });
  }
});
