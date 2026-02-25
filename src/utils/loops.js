// Detector de loops + throttle de intro (1x por hora por número)
const { lastIntroTimes } = require('./estados');
const { INTRO_COOLDOWN_MS } = require('../config');

function shouldSendIntro(phone) {
  const last = lastIntroTimes[phone];
  return !last || (Date.now() - last) > INTRO_COOLDOWN_MS;
}

function markIntroSent(phone) {
  lastIntroTimes[phone] = Date.now();
}

// Retorna true se detectou loop (2+ msgs iguais) — chamar antes de processar step
function checkRepeatLoop(state, normalizedMsg) {
  if (!state.repeatTracker) return false;
  if (normalizedMsg === state.repeatTracker.lastMsg) {
    state.repeatTracker.count++;
    return state.repeatTracker.count >= 2;
  }
  state.repeatTracker = { lastMsg: normalizedMsg, count: 1 };
  return false;
}

module.exports = {
  shouldSendIntro,
  markIntroSent,
  checkRepeatLoop,
};
