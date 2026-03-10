// src/renewal/renewal-cron.js — Lembrete de renovação automático
// Cron às 09:00 (Angola). 3d antes, no dia, +1d (marca a_verificar), +3d (liberta e notifica waitlist).
// RENEWAL_ENABLED=true | Rate limit 10 msg/dia | Não enviar 22h–08h

const cron = require('node-cron');
const {
  getLinhasRenovacao,
  marcarComoAVerificar,
  libertarPerfil,
} = require('../integrations/google-sheets');
const { notificarClientesWaitlist } = require('../stock/stock-notifier');

const MAX_RENEWAL_MESSAGES_PER_DAY = 10;
const RATE_LIMIT_MS = 6000;

let renewalMessagesSentToday = 0;
let lastResetDay = new Date().toDateString();

function resetDailyCountIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastResetDay) {
    renewalMessagesSentToday = 0;
    lastResetDay = today;
  }
}

function canSendRenewalMessage() {
  resetDailyCountIfNeeded();
  return renewalMessagesSentToday < MAX_RENEWAL_MESSAGES_PER_DAY;
}

/** Horário Angola: não enviar entre 22h e 08h. */
function isWithinAllowedHours() {
  const tz = 'Africa/Luanda';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('pt-AO', { timeZone: tz, hour: 'numeric' });
  const hour = parseInt(formatter.format(now), 10);
  if (hour >= 22 || hour < 8) return false;
  return true;
}

async function sendRenewalWhatsApp(phone, text) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || 'default';
  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

  try {
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      body: JSON.stringify({ number: jid, text }),
    });
    if (!res.ok) {
      console.error(`[RENEWAL] Envio falhou para ${phone}: ${res.status}`);
      return false;
    }
    renewalMessagesSentToday++;
    console.log(`[RENEWAL] Mensagem enviada para ${phone} (${renewalMessagesSentToday}/${MAX_RENEWAL_MESSAGES_PER_DAY})`);
    return true;
  } catch (err) {
    console.error(`[RENEWAL] Erro ao enviar para ${phone}:`, err.message);
    return false;
  }
}

async function notifySupervisor(text) {
  const raw = process.env.SUPERVISOR_NUMBERS || process.env.SUPERVISOR_NUMBER || '';
  const list = raw.split(',').map(s => s.trim().replace(/[^0-9]/g, '')).filter(Boolean);
  for (const num of list) {
    if (num) await sendRenewalWhatsApp(num, text);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatData(d) {
  if (!d) return 'N/D';
  const x = new Date(d);
  return x.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function runDailyRenewalJob(stockConfig, paymentConfig, supabase) {
  if (!stockConfig) return;
  if (!isWithinAllowedHours()) {
    console.log('[RENEWAL] Fora do horário permitido (22h–08h), sem envio.');
    return;
  }
  resetDailyCountIfNeeded();

  const p = paymentConfig || {};
  const metodoPagamento = p.methods ? p.methods.join(' ou ') : `IBAN ${p.iban || ''} / Multicaixa ${p.multicaixa || ''}`;

  try {
    // ── 3 dias antes da expiração ──
    const linhas3d = await getLinhasRenovacao(stockConfig, '3dias');
    for (const lin of linhas3d) {
      if (!canSendRenewalMessage()) break;
      const msg =
        `Olá ${lin.cliente || 'Cliente'}! 😊 A sua conta *${lin.platform}* (${lin.plano || 'Plano'}) expira no dia *${formatData(lin.dataExpiracaoRaw)}*. ` +
        `Para renovar sem interrupção, basta confirmar o pagamento de *${lin.valor || '—'} Kz*. Dados: ${metodoPagamento}. Quer renovar?`;
      await sendRenewalWhatsApp(lin.telefone, msg);
      await sleep(RATE_LIMIT_MS);
    }

    // ── No dia da expiração ──
    const linhasHoje = await getLinhasRenovacao(stockConfig, 'hoje');
    for (const lin of linhasHoje) {
      if (!canSendRenewalMessage()) break;
      const msg =
        `Olá ${lin.cliente || 'Cliente'}, a sua conta *${lin.platform}* expira hoje. ` +
        `Se quiser continuar, confirme o pagamento. Caso contrário, o perfil será libertado para outro cliente. Obrigado! 🤝`;
      await sendRenewalWhatsApp(lin.telefone, msg);
      await sleep(RATE_LIMIT_MS);
    }

    // ── 1 dia após expiração: marcar a_verificar + última mensagem + notificar supervisor ──
    const linhas1d = await getLinhasRenovacao(stockConfig, '1dia');
    for (const lin of linhas1d) {
      await marcarComoAVerificar(stockConfig, lin.sheetRow);
      if (canSendRenewalMessage()) {
        const msg =
          `A sua conta *${lin.platform}* expirou. Se ainda quiser renovar, tem 48h para regularizar. Depois o perfil será atribuído a outro cliente.`;
        await sendRenewalWhatsApp(lin.telefone, msg);
        await sleep(RATE_LIMIT_MS);
      }
      await notifySupervisor(
        `⚠️ Perfil ${lin.nomePerfil || lin.email || 'N/D'} da conta ${lin.email} expirou. Cliente ${lin.cliente || lin.telefone} não renovou. Libertando em 48h.`
      );
    }

    // ── 3 dias após expiração: libertar perfil e notificar waitlist ──
    const linhas3dLibertar = await getLinhasRenovacao(stockConfig, '3dias_libertar');
    for (const lin of linhas3dLibertar) {
      await libertarPerfil(stockConfig, lin.sheetRow);
      console.log(`[RENEWAL] Perfil libertado: linha ${lin.sheetRow} (${lin.platform})`);
      if (supabase && process.env.STOCK_NOTIFICATIONS_ENABLED === 'true') {
        try {
          await notificarClientesWaitlist(supabase, stockConfig, lin.platform);
        } catch (e) {
          console.error('[RENEWAL] Waitlist notify error:', e.message);
        }
      }
    }
  } catch (err) {
    console.error('[RENEWAL] runDailyRenewalJob error:', err.message);
  }
}

function initRenewal(stockConfig, paymentConfig, supabase) {
  if (process.env.RENEWAL_ENABLED !== 'true') {
    console.log('[RENEWAL] Desactivado (RENEWAL_ENABLED != true)');
    return;
  }
  console.log('[RENEWAL] ✅ Activado — cron diário às 09:00 (Angola)');
  cron.schedule(
    '0 9 * * *',
    () => {
      runDailyRenewalJob(stockConfig, paymentConfig, supabase).catch((e) =>
        console.error('[RENEWAL] Cron error:', e.message)
      );
    },
    { timezone: 'Africa/Luanda' }
  );
}

module.exports = { initRenewal, runDailyRenewalJob, sendRenewalWhatsApp };
