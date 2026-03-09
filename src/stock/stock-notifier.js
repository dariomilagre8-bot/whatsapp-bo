// src/stock/stock-notifier.js — Notificação automática de reposição de stock
// Opção A: Cron job a cada 30 min
// Opção B: Trigger manual via #stock [produto] [quantidade]

const cron = require('node-cron');
const { getStockCountsForPrompt } = require('../integrations/google-sheets');
const { getClientesPorNotificar, getProdutosEmEspera, marcarNotificados } = require('./waitlist');

const RATE_LIMIT_MS = 12000;      // 1 mensagem a cada 12 segundos = máx 5/min
const MAX_NOTIFICACOES_POR_CICLO = 20;

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
      console.error(`[STOCK-NOTIFIER] Envio falhou para ${phone}: ${res.status}`);
      return false;
    }
    console.log(`[STOCK-NOTIFIER] ✅ Mensagem enviada para ${phone}`);
    return true;
  } catch (err) {
    console.error(`[STOCK-NOTIFIER] Erro ao enviar para ${phone}:`, err.message);
    return false;
  }
}

/**
 * Pausa de rate-limiting.
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Verifica se uma plataforma tem stock disponível a partir das contagens actuais.
 */
function temStock(stockCounts, produto) {
  if (!stockCounts) return false;
  const p = produto.toLowerCase();
  if (p.includes('netflix')) {
    return (stockCounts.netflix_individual || 0) > 0;
  }
  if (p.includes('prime')) {
    return (stockCounts.prime_individual || 0) > 0;
  }
  return false;
}

/**
 * Core: notifica clientes da waitlist para os produtos que têm stock reposto.
 * Usado tanto pelo cron job (Opção A) como pelo comando #stock (Opção B).
 * @param {object} supabase - Cliente Supabase
 * @param {object} stockConfig - Configuração do Google Sheets
 * @param {string|null} produtoForcado - Se definido, força notificação para este produto (Opção B)
 * @returns {Promise<number>} Número de notificações enviadas
 */
async function notificarClientesWaitlist(supabase, stockConfig, produtoForcado = null) {
  if (!supabase) return 0;

  let produtos = [];

  if (produtoForcado) {
    produtos = [produtoForcado];
  } else {
    produtos = await getProdutosEmEspera(supabase);
    if (produtos.length === 0) {
      console.log('[STOCK-NOTIFIER] Waitlist vazia, sem notificações a enviar');
      return 0;
    }
  }

  let { counts, erro } = await getStockCountsForPrompt(stockConfig);
  if (erro && !produtoForcado) {
    console.error('[STOCK-NOTIFIER] Erro ao obter stock — notificações suspensas:', erro);
    return 0;
  }

  let totalEnviados = 0;

  for (const produto of produtos) {
    if (!produtoForcado && !temStock(counts, produto)) {
      console.log(`[STOCK-NOTIFIER] ${produto} ainda sem stock, a ignorar`);
      continue;
    }

    const clientes = await getClientesPorNotificar(supabase, produto);
    if (clientes.length === 0) {
      console.log(`[STOCK-NOTIFIER] Nenhum cliente em espera para ${produto}`);
      continue;
    }

    console.log(`[STOCK-NOTIFIER] ${clientes.length} cliente(s) a notificar para ${produto}`);
    const idsNotificados = [];

    for (const cliente of clientes) {
      if (totalEnviados >= MAX_NOTIFICACOES_POR_CICLO) {
        console.log(`[STOCK-NOTIFIER] Limite de ${MAX_NOTIFICACOES_POR_CICLO} notificações por ciclo atingido`);
        break;
      }

      const nome = cliente.nome_cliente || 'Cliente';
      const msg =
        `Olá ${nome}! 🎉 Boas notícias — o *${produto}* que procurava já está disponível!\n\n` +
        `Quer que reserve um acesso para si? Responda com "Sim" e tratarei de tudo. 😊`;

      const ok = await sendWhatsApp(cliente.numero_cliente, msg);
      if (ok) {
        idsNotificados.push(cliente.id);
        totalEnviados++;
        if (totalEnviados < clientes.length) {
          await sleep(RATE_LIMIT_MS);
        }
      }
    }

    if (idsNotificados.length > 0) {
      await marcarNotificados(supabase, idsNotificados);
    }
  }

  console.log(`[STOCK-NOTIFIER] Ciclo concluído: ${totalEnviados} notificação(ões) enviada(s)`);
  return totalEnviados;
}

/**
 * Opção B: Trigger manual pelo supervisor (#stock [produto] [quantidade]).
 * @param {object} supabase
 * @param {object} stockConfig
 * @param {string} produto - Nome do produto (ex: "Netflix", "Prime Video")
 * @returns {Promise<string>} Mensagem de retorno para o supervisor
 */
async function triggerStockReposto(supabase, stockConfig, produto) {
  if (!supabase) return '❌ Supabase não configurado.';

  console.log(`[STOCK-NOTIFIER] Trigger manual para "${produto}"`);
  try {
    const enviados = await notificarClientesWaitlist(supabase, stockConfig, produto);
    if (enviados === 0) {
      return `✅ Stock de "${produto}" actualizado. Nenhum cliente em lista de espera para notificar.`;
    }
    return `✅ Stock de "${produto}" actualizado. ${enviados} cliente(s) notificado(s) da lista de espera!`;
  } catch (err) {
    console.error('[STOCK-NOTIFIER] triggerStockReposto error:', err.message);
    return `❌ Erro ao notificar waitlist: ${err.message}`;
  }
}

/**
 * Inicializa o cron job de verificação de stock (Opção A).
 * Corre a cada 30 minutos se STOCK_NOTIFICATIONS_ENABLED=true.
 * @param {object} supabase
 * @param {object} stockConfig - config.stock do streamzone.js
 */
function initStockNotifier(supabase, stockConfig) {
  if (process.env.STOCK_NOTIFICATIONS_ENABLED !== 'true') {
    console.log('[STOCK-NOTIFIER] Desactivado (STOCK_NOTIFICATIONS_ENABLED != true)');
    return;
  }

  if (!supabase) {
    console.log('[STOCK-NOTIFIER] Supabase não configurado — cron não iniciado');
    return;
  }

  console.log('[STOCK-NOTIFIER] ✅ Activado — cron a cada 30 minutos');

  // A cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    console.log('[STOCK-NOTIFIER] Cron: a verificar reposições de stock...');
    try {
      await notificarClientesWaitlist(supabase, stockConfig);
    } catch (err) {
      console.error('[STOCK-NOTIFIER] Cron error:', err.message);
    }
  }, { timezone: 'Africa/Luanda' });
}

module.exports = { initStockNotifier, triggerStockReposto, notificarClientesWaitlist };
