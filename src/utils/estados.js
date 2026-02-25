// chatHistories, clientStates, pendingVerifications, pausedClients, lastIntroTimes + persistência Supabase
const { supabase } = require('../../supabase');

const chatHistories = {};
const clientStates = {};
const pendingVerifications = {};
const pausedClients = {};
const lastIntroTimes = {};
const dirtySessions = new Set();

function markDirty(phone) {
  dirtySessions.add(phone);
}

async function persistSession(phone) {
  if (!supabase) return;
  try {
    await supabase.from('sessoes').upsert({
      whatsapp: phone,
      client_state: clientStates[phone] || null,
      chat_history: chatHistories[phone] ? chatHistories[phone].slice(-20) : null,
      pending_verification: pendingVerifications[phone] || null,
      is_paused: !!pausedClients[phone],
      last_intro_ts: lastIntroTimes[phone] || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'whatsapp' });
  } catch (e) {
    console.error(`⚠️ persistSession ${phone}:`, e.message);
  }
}

function cleanupSession(phone) {
  delete clientStates[phone];
  delete chatHistories[phone];
  delete pendingVerifications[phone];
  delete pausedClients[phone];
  dirtySessions.delete(phone);
  if (supabase) {
    supabase.from('sessoes').delete().eq('whatsapp', phone)
      .then(() => {})
      .catch(e => console.error(`⚠️ cleanupSession Supabase ${phone}:`, e.message));
  }
}

async function loadSessionsOnStartup() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('sessoes').select('*');
    if (error) throw new Error(error.message);
    const now = Date.now();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    let count = 0;
    for (const row of (data || [])) {
      const phone = row.whatsapp;
      const hasPending = !!row.pending_verification;
      const lastAct = row.client_state?.lastActivity || 0;
      if (!hasPending && (now - lastAct) > TWO_HOURS) continue;
      if (row.client_state) {
        const s = row.client_state;
        if (!s.objeccoes) s.objeccoes = [];
        if (s.upsell_tentado === undefined) s.upsell_tentado = false;
        if (!s.score) s.score = { mensagens_enviadas: 0, objecoes_resolvidas: 0, tempo_resposta_medio: 0, converteu: false };
        clientStates[phone] = s;
      }
      if (row.chat_history) chatHistories[phone] = row.chat_history;
      if (row.pending_verification) pendingVerifications[phone] = row.pending_verification;
      if (row.is_paused) pausedClients[phone] = true;
      if (row.last_intro_ts) lastIntroTimes[phone] = row.last_intro_ts;
      count++;
    }
    console.log(`✅ Sessões restauradas do Supabase: ${count}`);
  } catch (e) {
    console.error('❌ Erro ao restaurar sessões:', e.message);
  }
}

function startFlushInterval() {
  setInterval(async () => {
    if (dirtySessions.size === 0) return;
    const phones = [...dirtySessions];
    dirtySessions.clear();
    for (const phone of phones) {
      await persistSession(phone);
    }
  }, 15 * 1000);
}

function initClientState(extra) {
  return {
    step: 'inicio',
    clientName: '',
    isRenewal: false,
    interestStack: [],
    currentItemIndex: 0,
    cart: [],
    serviceKey: null,
    plataforma: null,
    plano: null,
    valor: null,
    totalValor: 0,
    lastActivity: Date.now(),
    repeatTracker: { lastMsg: '', count: 0 },
    paymentReminderSent: false,
    objeccoes: [],
    upsell_tentado: false,
    exitIntentAt: null,
    exitIntentFollowUpSent: false,
    clientType: null,
    score: {
      mensagens_enviadas: 0,
      objecoes_resolvidas: 0,
      tempo_resposta_medio: 0,
      converteu: false,
    },
    ...extra
  };
}

module.exports = {
  chatHistories,
  clientStates,
  pendingVerifications,
  pausedClients,
  lastIntroTimes,
  dirtySessions,
  markDirty,
  persistSession,
  cleanupSession,
  loadSessionsOnStartup,
  startFlushInterval,
  initClientState,
};
