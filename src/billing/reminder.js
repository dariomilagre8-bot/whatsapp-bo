// src/billing/reminder.js — Sistema de lembrete de pagamento automático
const cron = require('node-cron');

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
    if (!res.ok) console.error(`[BILLING] Envio falhou para ${phone}: ${res.status}`);
    else console.log(`[BILLING] Mensagem enviada para ${phone}`);
    return res.ok;
  } catch (err) {
    console.error(`[BILLING] Erro de envio para ${phone}:`, err.message);
    return false;
  }
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function clientePagouEsteMes(ultimoPagamento) {
  if (!ultimoPagamento) return false;
  const pagamento = new Date(ultimoPagamento);
  const inicioMes = startOfCurrentMonth();
  return pagamento >= inicioMes;
}

async function getClientesActivos(supabase) {
  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome_empresa, numero_whatsapp, pacote, valor_mensal_kz, data_inicio, activo, ultimo_pagamento')
      .eq('activo', true);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[BILLING] Erro ao buscar clientes:', err.message);
    return [];
  }
}

async function getClientesNaoPagos(supabase) {
  const clientes = await getClientesActivos(supabase);
  return clientes.filter(c => !clientePagouEsteMes(c.ultimo_pagamento));
}

async function enviarLembreteDia1(supabase) {
  console.log('[BILLING] Executando lembrete dia 1...');
  const multicaixa = process.env.BILLING_MULTICAIXA || '(não configurado)';
  const conta = process.env.BILLING_CONTA || '(não configurado)';
  const clientes = await getClientesActivos(supabase);

  for (const cliente of clientes) {
    const msg = `Bom dia ${cliente.nome_empresa}! 🗓️\n` +
      `O valor do serviço de assistente virtual deste mês é de ${cliente.valor_mensal_kz} Kz.\n` +
      `Dados para pagamento:\n` +
      `📱 Multicaixa Express: ${multicaixa}\n` +
      `🏦 Transferência: ${conta}\n` +
      `Obrigado pela confiança! 🤝`;
    await sendWhatsApp(cliente.numero_whatsapp, msg);
  }
  console.log(`[BILLING] Dia 1: ${clientes.length} lembretes enviados`);
}

async function enviarLembreteDia8(supabase) {
  console.log('[BILLING] Executando lembrete dia 8...');
  const naoPagos = await getClientesNaoPagos(supabase);

  for (const cliente of naoPagos) {
    const msg = `Olá ${cliente.nome_empresa}, lembramos que o pagamento de ${cliente.valor_mensal_kz} Kz ` +
      `referente ao serviço de assistente virtual está pendente. ` +
      `Para evitar interrupções, agradecemos a regularização. Obrigado!`;
    await sendWhatsApp(cliente.numero_whatsapp, msg);
  }
  console.log(`[BILLING] Dia 8: ${naoPagos.length} lembretes de atraso enviados`);
}

async function pausarClientesDia16(supabase) {
  console.log('[BILLING] Executando pausa dia 16...');
  const naoPagos = await getClientesNaoPagos(supabase);

  for (const cliente of naoPagos) {
    try {
      await supabase
        .from('clientes')
        .update({ activo: false, updated_at: new Date().toISOString() })
        .eq('id', cliente.id);
    } catch (err) {
      console.error(`[BILLING] Erro ao pausar ${cliente.nome_empresa}:`, err.message);
    }

    const msg = `${cliente.nome_empresa}, o seu assistente virtual foi temporariamente pausado ` +
      `por pagamento pendente. Para reactivar, efectue o pagamento de ${cliente.valor_mensal_kz} Kz ` +
      `e confirme connosco. Obrigado.`;
    await sendWhatsApp(cliente.numero_whatsapp, msg);
  }
  console.log(`[BILLING] Dia 16: ${naoPagos.length} clientes pausados`);
}

async function handlePaymentConfirmation(supabase, phoneNumber) {
  const normalized = (phoneNumber || '').replace(/[^0-9]/g, '');
  if (!normalized) return null;

  try {
    const { data: cliente, error: findErr } = await supabase
      .from('clientes')
      .select('*')
      .eq('numero_whatsapp', normalized)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!cliente) {
      console.log(`[BILLING] Cliente não encontrado: ${normalized}`);
      return null;
    }

    const { error: updateErr } = await supabase
      .from('clientes')
      .update({
        ultimo_pagamento: new Date().toISOString(),
        activo: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cliente.id);

    if (updateErr) throw updateErr;

    console.log(`[BILLING] Pagamento confirmado para ${cliente.nome_empresa} (${normalized})`);
    return { ...cliente, activo: true, ultimo_pagamento: new Date().toISOString() };
  } catch (err) {
    console.error(`[BILLING] Erro ao confirmar pagamento:`, err.message);
    return null;
  }
}

function initBilling(supabase) {
  if (process.env.BILLING_ENABLED !== 'true') {
    console.log('[BILLING] Sistema de billing desactivado (BILLING_ENABLED != true)');
    return;
  }

  console.log('[BILLING] Sistema de billing activado');

  // Dia 1 de cada mês às 10:00 Angola (UTC+1) = 09:00 UTC
  cron.schedule('0 9 1 * *', () => enviarLembreteDia1(supabase), { timezone: 'Africa/Luanda' });

  // Dia 8 — lembrete de atraso
  cron.schedule('0 9 8 * *', () => enviarLembreteDia8(supabase), { timezone: 'Africa/Luanda' });

  // Dia 16 — pausar clientes inadimplentes
  cron.schedule('0 9 16 * *', () => pausarClientesDia16(supabase), { timezone: 'Africa/Luanda' });

  console.log('[BILLING] Cron jobs agendados: dia 1, 8 e 16 às 10:00 (Angola)');
}

module.exports = { initBilling, handlePaymentConfirmation };
