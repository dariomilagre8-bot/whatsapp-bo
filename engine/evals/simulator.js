// engine/evals/simulator.js — Loop conversa: persona → handler → persona (mock, sem HTTP/Evolution)
// Usa message-handler quando disponível; senão gera respostas stub para o judge.

const { findMatch } = require('../lib/matcher');

async function simulate(persona, clientConfig, maxTurns = 10) {
  const transcript = [];
  const fixedResponses = clientConfig.fixedResponses || [];
  const currentState = clientConfig.states?.initial || 'inicio';

  for (let turn = 0; turn < maxTurns; turn++) {
    const userMsg = persona.generateMessage(transcript, turn);
    if (!userMsg) break;

    transcript.push({ role: 'user', text: userMsg, turn });

    const match = findMatch(userMsg, fixedResponses, currentState);
    let botText = 'Não compreendi. Pode reformular?';
    if (match && match.response) {
      botText = typeof match.response === 'function' ? match.response() : match.response;
    } else if (match && match.handler) {
      botText = '[dynamic:' + match.handler + ']';
    }

    transcript.push({ role: 'bot', text: botText, turn });
  }

  return { persona: persona.name, transcript };
}

module.exports = { simulate };
