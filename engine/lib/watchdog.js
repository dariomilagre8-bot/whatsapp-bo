// engine/lib/watchdog.js — Watchdog autónomo: health checks, auto-recovery, alertas supervisores
// Alertas de INFRA: Don (244941713216) + supervisores do bot.

const { getHealth } = require('./health');

/** Receptores fixos de alertas de infra (monitor, bot parado, inactividade). */
const DEFAULT_INFRA_ALERT_RECIPIENTS = ['244941713216'];

class Watchdog {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 300000; // 5 min
    this.infraRecipients = options.infraRecipients || DEFAULT_INFRA_ALERT_RECIPIENTS;
    this.supervisors = options.supervisors || ['244941713216'];
    this.sender = options.sender;
    this.evolutionConfig = options.evolutionConfig;
    this.clientConfig = options.clientConfig;
    this.dependencies = options.dependencies;
    this.timer = null;
    this.lastMessageTimes = new Map();
    // Throttle alertas: guardar timestamps por tipo para evitar spam
    this.lastAlertTimes = new Map();
    this.alertThrottleMs = options.alertThrottleMs || 1800000; // 30 min entre alertas do mesmo tipo
  }

  start() {
    const allAlert = [...new Set([...this.infraRecipients, ...this.supervisors].filter(Boolean))];
    console.log(`[WATCHDOG] Iniciado — check a cada ${this.intervalMs / 1000}s | alertas: ${allAlert.join(', ')}`);
    this.timer = setInterval(() => this.check(), this.intervalMs);
    // Primeiro check com delay de 30s para dar tempo ao boot
    setTimeout(() => this.check(), 30000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[WATCHDOG] Parado');
  }

  recordMessage(clientSlug) {
    this.lastMessageTimes.set(clientSlug, Date.now());
  }

  /** Última mensagem inbound registada (qualquer cliente). */
  getLastMessageIso() {
    let latest = 0;
    for (const t of this.lastMessageTimes.values()) {
      if (t > latest) latest = t;
    }
    return latest ? new Date(latest).toISOString() : null;
  }

  async check() {
    try {
      const health = await getHealth(this.dependencies);
      const botName = this._botName();
      console.log(`[WATCHDOG] ${botName} | ${health.status.toUpperCase()} | uptime: ${health.uptime}s`);

      if (health.status !== 'healthy') {
        await this.handleDegraded(health);
      }

      await this.checkInactivity();
    } catch (error) {
      console.error('[WATCHDOG] Erro no check:', error.message);
    }
  }

  async handleDegraded(health) {
    const problems = [];

    if (health.checks.evolution?.status === 'error') {
      problems.push('Evolution API desconectada');
      await this.tryRecoverEvolution();
    }

    if (health.checks.redis?.status === 'error') {
      problems.push('Redis desconectado');
    }

    if (health.checks.supabase?.status === 'error') {
      problems.push('Supabase inacessível');
    }

    if (problems.length === 0) return;

    const alertKey = `degraded:${problems.join(',')}`;
    if (!this._shouldAlert(alertKey)) return;

    await this.alert(
      `⚠️ [PA ALERTA] Bot ${this._botName()} ${health.status.toUpperCase()}\n` +
      `Problemas: ${problems.join(', ')}\n` +
      `Uptime: ${health.uptime}s\n` +
      `Hora: ${new Date().toISOString()}`
    );
  }

  async tryRecoverEvolution() {
    try {
      const instanceName = this.clientConfig?.evolutionInstance || this.evolutionConfig?.instance;
      if (!instanceName) return;

      console.log(`[WATCHDOG] Tentando restart Evolution: ${instanceName}`);
      const url = `${process.env.EVOLUTION_API_URL}/instance/restart/${instanceName}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { apikey: process.env.EVOLUTION_API_KEY },
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        console.log(`[WATCHDOG] Evolution restart enviado para ${instanceName}`);
      } else {
        console.error(`[WATCHDOG] Falha restart Evolution: HTTP ${res.status}`);
      }
    } catch (e) {
      console.error(`[WATCHDOG] Erro ao tentar recovery Evolution:`, e.message);
    }
  }

  async checkInactivity() {
    // Hora Angola = UTC+1
    const angolaHour = (new Date().getUTCHours() + 1) % 24;
    if (angolaHour < 8 || angolaHour > 22) return;

    const slug = this.clientConfig?.clientSlug || this.clientConfig?.slug;
    if (!slug) return;

    const lastMsg = this.lastMessageTimes.get(slug);
    if (!lastMsg) return;

    const hoursSinceLastMsg = (Date.now() - lastMsg) / 3600000;
    if (hoursSinceLastMsg <= 6) return;

    const alertKey = `inactivity:${slug}`;
    if (!this._shouldAlert(alertKey)) return;

    await this.alert(
      `ℹ️ [PA INFO] Bot ${this._botName()} sem mensagens há ${Math.floor(hoursSinceLastMsg)}h.\n` +
      `Possível problema de webhook ou instância desconectada.`
    );
  }

  async alert(message) {
    if (!this.sender) {
      console.warn('[WATCHDOG] Sem sender — alerta apenas em log:');
      console.warn('[WATCHDOG-ALERT]', message);
      return;
    }

    const recipients = [...new Set([...this.infraRecipients, ...this.supervisors].filter(Boolean))];
    for (const phone of recipients) {
      try {
        await this.sender.sendText(phone, message, this.evolutionConfig, this.clientConfig);
        console.log(`[WATCHDOG] Alerta enviado para ${phone}`);
      } catch (e) {
        console.error(`[WATCHDOG] Falha ao enviar alerta para ${phone}:`, e.message);
      }
    }
  }

  _botName() {
    return (
      (this.clientConfig?.identity && this.clientConfig.identity.botName) ||
      this.clientConfig?.botName ||
      this.clientConfig?.slug ||
      this.clientConfig?.clientSlug ||
      'desconhecido'
    );
  }

  _shouldAlert(key) {
    const last = this.lastAlertTimes.get(key) || 0;
    const now = Date.now();
    if (now - last < this.alertThrottleMs) return false;
    this.lastAlertTimes.set(key, now);
    return true;
  }
}

module.exports = { Watchdog, DEFAULT_INFRA_ALERT_RECIPIENTS };
