// engine/lib/state-machine.js — Máquina de estados genérica

class StateMachine {
  constructor(config) {
    this.config = config;
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
        pendingSale: null,
        replyJid: null,
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
    if (session.history.length > 10) {
      session.history = session.history.slice(-10);
    }
  }

  cleanup() {
    const now = Date.now();
    const TTL = 24 * 60 * 60 * 1000;
    for (const [phone, session] of this.sessions) {
      if (now - session.lastActivity > TTL) {
        this.sessions.delete(phone);
        console.log(`[STATE] ${phone}: session expired (24h)`);
      }
    }
  }
}

module.exports = StateMachine;
