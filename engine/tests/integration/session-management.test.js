'use strict';

// Sessões de conversa: StateMachine em memória (histórico + TTL em cleanup). Dedup/queue usam Redis.

const StateMachine = require('../../lib/state-machine');

describe('session management (StateMachine)', () => {
  const cfg = {
    states: {
      initial: 'menu',
      transitions: { menu: ['checkout'], checkout: ['menu'] },
    },
  };

  it('msg2 no mesmo utilizador mantém contexto da msg1', () => {
    const sm = new StateMachine(cfg);
    const phone = '244900000001';
    sm.addToHistory(phone, 'user', 'Quero Netflix');
    sm.addToHistory(phone, 'assistant', 'Qual plano prefere?');
    sm.addToHistory(phone, 'user', 'Individual');
    const { history } = sm.getSession(phone);
    expect(history.some((m) => m.text === 'Quero Netflix')).toBe(true);
  });

  it('após TTL simulado cleanup apaga sessão (nova conversa)', () => {
    const sm = new StateMachine(cfg);
    const phone = '244900000002';
    sm.getSession(phone);
    sm.sessions.get(phone).lastActivity = Date.now() - 25 * 60 * 60 * 1000;
    sm.cleanup();
    expect(sm.sessions.has(phone)).toBe(false);
    sm.getSession(phone);
    expect(sm.getSession(phone).history.length).toBe(0);
  });
});
