// src/engine/state-machine.js
// Máquina de estados genérica — funciona com QUALQUER business config

class StateMachine {
  constructor(config) {
    this.config = config;
    // Sessões em memória: { telefone: { state, platform, plan, name, lastResponse, history[], createdAt, lastActivity } }
    this.sessions = new Map();
  }

  getSession(phone) {
    if (!this.sessions.has(phone)) {
      this.sessions.set(phone, {
        state: this.config.states.initial,
        platform: null,
        plan: null,
        name: null,
        lastResponse: null,
        lastResponseId: null,
        history: [],
        paused: false,
        pendingSale: null, // #RESUMO_VENDA capturado para fluxo de aprovação (#sim)
        replyJid: null, // JID para envio (ex.: 251...@s.whatsapp.net ou @lid)
        createdAt: Date.now(),
        lastActivity: Date.now(),
      });
    }
    const session = this.sessions.get(phone);
    session.lastActivity = Date.now();
    return session;
  }

  setState(phone, newState) {
    const session = this.getSession(phone);
    const allowed = this.config.states.transitions[session.state];
    if (allowed && allowed.includes(newState)) {
      console.log(`[STATE] ${phone}: ${session.state} → ${newState}`);
      session.state = newState;
      return true;
    }
    // Se não é transição válida, forçar reset para menu (safety net)
    console.log(`[STATE] ${phone}: INVALID ${session.state} → ${newState}, forcing menu`);
    session.state = 'menu';
    return false;
  }

  resetSession(phone) {
    const session = this.getSession(phone);
    session.state = this.config.states.initial;
    session.platform = null;
    session.plan = null;
    session.paused = false;
    session.pendingSale = null;
    session.lastResponse = null;
    session.lastResponseId = null;
    session.history = [];
    console.log(`[STATE] ${phone}: RESET to ${this.config.states.initial}`);
  }

  addToHistory(phone, role, text) {
    const session = this.getSession(phone);
    session.history.push({ role, text, ts: Date.now() });
    // Manter apenas últimas 10 mensagens
    if (session.history.length > 10) {
      session.history = session.history.slice(-10);
    }
  }

  // Limpar sessões inactivas (> 24h)
  cleanup() {
    const now = Date.now();
    const TTL = 24 * 60 * 60 * 1000; // 24h
    for (const [phone, session] of this.sessions) {
      if (now - session.lastActivity > TTL) {
        this.sessions.delete(phone);
        console.log(`[STATE] ${phone}: session expired (24h)`);
      }
    }
  }
}

module.exports = StateMachine;
