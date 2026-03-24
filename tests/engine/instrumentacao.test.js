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

const { buildKpiInsertPayload, deriveResolutionType } = require('../../engine/orchestrator');

console.log('\n🧪 TESTES — instrumentação KPI (orchestrator)\n');

test('buildKpiInsertPayload mapeia campos snake_case', () => {
  const row = buildKpiInsertPayload({
    clientId: 'streamzone',
    responseTimeMs: 1200,
    llmProvider: 'claude',
    llmSuccess: true,
    intentDetected: 'INTENT_VENDA',
    intentConfidence: 0.9,
    resolutionType: 'bot_resolved',
    llmRoutingReason: 'medium',
    tokensUsed: null,
    traceId: 't-1',
    phone: '244900000000',
  });
  assert(row.client_id === 'streamzone');
  assert(row.response_time_ms === 1200);
  assert(row.llm_provider === 'claude');
  assert(row.llm_success === true);
  assert(row.intent_detected === 'INTENT_VENDA');
  assert(row.intent_confidence === 0.9);
  assert(row.resolution_type === 'bot_resolved');
  assert(row.llm_routing_reason === 'medium');
  assert(row.trace_id === 't-1');
  assert(row.phone === '244900000000');
});

test('deriveResolutionType: pausa → human_escalated', () => {
  assert(
    deriveResolutionType({ pausedAfter: true, hadEscalationTag: false, llmUsed: true })
    === 'human_escalated'
  );
});

test('deriveResolutionType: LLM ok sem pausa → bot_resolved', () => {
  assert(
    deriveResolutionType({ pausedAfter: false, hadEscalationTag: false, llmUsed: true })
    === 'bot_resolved'
  );
});

console.log(`\n📊 instrumentacao: ${passed} ok, ${failed} falharam\n`);
if (failed) process.exit(1);
