'use strict';

// engine/utils/qualifying-questions.js
// Helper para BUG-056: perguntar 1-2 perguntas antes de escalar.

const DEFAULT_QUALIFYING_QUESTIONS = [
  'Qual plataforma ou serviço está com problema?',
  'Desde quando tem este problema?',
];

function needsQualifyingQuestions(intent) {
  return intent === 'INTENT_SUPORTE_CODIGO' || intent === 'INTENT_SUPORTE_ERRO';
}

function getQuestionsForClient(clientConfig) {
  const fromConfig = clientConfig && Array.isArray(clientConfig.qualifyingQuestions)
    ? clientConfig.qualifyingQuestions.filter(Boolean)
    : [];
  return fromConfig.length > 0 ? fromConfig : DEFAULT_QUALIFYING_QUESTIONS;
}

function getNextQualifyingIndex(chatState) {
  const answers = chatState && Array.isArray(chatState.qualifyingAnswers) ? chatState.qualifyingAnswers : [];
  return answers.length;
}

function recordQualifyingAnswer(chatState, question, answer) {
  if (!chatState.qualifyingAnswers) chatState.qualifyingAnswers = [];
  chatState.qualifyingAnswers.push({ question, answer, timestamp: Date.now() });
  return chatState;
}

module.exports = {
  DEFAULT_QUALIFYING_QUESTIONS,
  needsQualifyingQuestions,
  getQuestionsForClient,
  getNextQualifyingIndex,
  recordQualifyingAnswer,
};

