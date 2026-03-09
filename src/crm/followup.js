// src/crm/followup.js — Follow-up automático para clientes que compraram há 30 dias
// Cron job: 1x por dia às 10:00 (hora Angola, UTC+1)
// Activo apenas se FOLLOWUP_ENABLED=true no .env

const cron = require('node-cron');

const MAX_FOLLOWUPS_POR_DIA = 10;
const RATE_LIMIT_MS = 6000; // 1 mensagem a cada 6 segundos

/**
 * Envia mensagem WhatsApp via Evolution API.
 */
async function sendWhatsApp(phone, text) {
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
      console.error(`[FOLLOWUP] Envio falhou para ${phone}: ${res.status}`);
      return false;
    }
    console.log(`[FOLLOWUP] ✅ Follow-up enviado para ${phone}`);
    return true;
  } catch (err) {
    console.error(`[FOLLOWUP] Erro ao enviar para ${phone}:`, err.message);
    return false;
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Busca leads elegíveis para follow-up:
 * - status = 'comprou' ou 'recorrente'
 * - ultima_compra entre 30 e 60 dias atrás
 * - follow_up_enviado = false
 */
async function getLeadsParaFollowUp(supabase) {
  if (!supabase) return [];
  try {
    const agora = new Date();

    const limite30 = new Date(agora);
    limite30.setDate(agora.getDate() - 30);

    const limite60 = new Date(agora);
    limite60.setDate(agora.getDate() - 60);

    const { data, error } = await supabase
      .from('leads')
      .select('id, numero, nome, ultima_compra, produtos_interesse')
      .in('status', ['comprou', 'recorrente'])
      .eq('follow_up_enviado', false)
      .lte('ultima_compra', limite30.toISOString())
      .gte('ultima_compra', limite60.toISOString())
      .order('ultima_compra', { ascending: true })
      .limit(MAX_FOLLOWUPS_POR_DIA);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[FOLLOWUP] getLeadsParaFollowUp error:', err.message);
    return [];
  }
}

/**
 * Executa o ciclo de follow-up.
 */
async function executarFollowUps(supabase) {
  console.log('[FOLLOWUP] A iniciar ciclo diário de follow-ups...');
  const leads = await getLeadsParaFollowUp(supabase);

  if (leads.length === 0) {
    console.log('[FOLLOWUP] Nenhum lead elegível hoje');
    return;
  }

  console.log(`[FOLLOWUP] ${leads.length} lead(s) a contactar`);
  let enviados = 0;

  for (const lead of leads) {
    const nome = lead.nome || 'Cliente';
    const produtos = (lead.produtos_interesse || []).join(', ');
    const produtoMencao = produtos ? `sobre ${produtos}` : 'os nossos serviços';

    const msg =
      `Olá ${nome}! 😊\n\n` +
      `Passado um mês desde a sua última aquisição connosco, quisemos saber se está tudo bem com o seu acesso.\n\n` +
      `Temos novidades no catálogo e novas vagas disponíveis. Quer dar uma vista de olhos? 🎬\n\n` +
      `Estou à disposição para qualquer dúvida!`;

    const ok = await sendWhatsApp(lead.numero, msg);
    if (ok) {
      try {
        await supabase.from('leads').update({
          follow_up_enviado: true,
          data_follow_up: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', lead.id);
      } catch (updateErr) {
        console.error('[FOLLOWUP] Erro ao actualizar lead:', updateErr.message);
      }
      enviados++;
    }

    if (enviados < leads.length) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log(`[FOLLOWUP] Ciclo concluído: ${enviados}/${leads.length} follow-up(s) enviado(s)`);
}

/**
 * Inicializa o cron job de follow-up diário.
 * Corre às 10:00 hora de Angola (UTC+1) = 09:00 UTC.
 * Activo apenas se FOLLOWUP_ENABLED=true.
 */
function initFollowUp(supabase) {
  if (process.env.FOLLOWUP_ENABLED !== 'true') {
    console.log('[FOLLOWUP] Desactivado (FOLLOWUP_ENABLED != true)');
    return;
  }

  if (!supabase) {
    console.log('[FOLLOWUP] Supabase não configurado — cron não iniciado');
    return;
  }

  console.log('[FOLLOWUP] ✅ Activado — cron diário às 10:00 (Angola)');

  // Às 10:00 hora de Angola
  cron.schedule('0 10 * * *', async () => {
    try {
      await executarFollowUps(supabase);
    } catch (err) {
      console.error('[FOLLOWUP] Cron error:', err.message);
    }
  }, { timezone: 'Africa/Luanda' });
}

module.exports = { initFollowUp, executarFollowUps };
