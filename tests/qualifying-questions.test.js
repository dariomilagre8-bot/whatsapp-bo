'use strict';

const {
  DEFAULT_QUALIFYING_QUESTIONS,
  needsQualifyingQuestions,
  getQuestionsForClient,
  recordQualifyingAnswer,
} = require('../engine/utils/qualifying-questions');

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

console.log('\n🧪 qualifying-questions util');

test('needsQualifyingQuestions para suportes', () => {
  assert(needsQualifyingQuestions('INTENT_SUPORTE_ERRO') === true, 'expected true for SUPORTE_ERRO');
  assert(needsQualifyingQuestions('INTENT_SUPORTE_CODIGO') === true, 'expected true for SUPORTE_CODIGO');
  assert(needsQualifyingQuestions('INTENT_VENDA') === false, 'expected false for other intents');
});

test('getQuestionsForClient usa default', () => {
  const qs = getQuestionsForClient(null);
  assert(Array.isArray(qs) && qs.length === DEFAULT_QUALIFYING_QUESTIONS.length, 'expected default length');
});

test('getQuestionsForClient usa override do cliente', () => {
  const override = ['Q1', 'Q2'];
  const qs = getQuestionsForClient({ qualifyingQuestions: override });
  assert(qs[0] === 'Q1' && qs[1] === 'Q2', 'expected override questions');
});

test('recordQualifyingAnswer empilha no estado', () => {
  const state = {};
  recordQualifyingAnswer(state, 'Pergunta', 'Resposta');
  assert(Array.isArray(state.qualifyingAnswers) && state.qualifyingAnswers.length === 1, 'expected 1 answer');
  assert(state.qualifyingAnswers[0].question === 'Pergunta', 'expected question saved');
  assert(state.qualifyingAnswers[0].answer === 'Resposta', 'expected answer saved');
});

console.log(`\n✅ Passed: ${passed} ❌ Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);

