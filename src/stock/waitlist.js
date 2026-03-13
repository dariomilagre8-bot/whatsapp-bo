// src/stock/waitlist.js — Operações Supabase para lista de espera de reposição de stock

const { extractPhoneNumber } = require('../utils/phone');
const MAX_DAYS_WAITLIST = 30; // Não notificar leads com mais de 30 dias

/**
 * Adiciona cliente à lista de espera para um produto esgotado.
 * Non-blocking: retorna null em caso de erro, sem lançar excepção.
 */
async function addToWaitlist(supabase, numero, nome, produto) {
  if (!supabase || !numero || !produto) return null;
  const normalized = extractPhoneNumber(numero) || String(numero).replace('@s.whatsapp.net', '').trim();
  if (!normalized) return null;
  try {
    console.log(`[WAITLIST] Tentando criar registo: numero=${normalized}, produto=${produto}`);

    // Verificar se já existe entrada activa (não notificada) para este cliente/produto
    const { data: existing } = await supabase
      .from('stock_waitlist')
      .select('id')
      .eq('numero_cliente', normalized)
      .ilike('produto_desejado', `%${produto.split(' ')[0]}%`)
      .eq('notificado', false)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[WAITLIST] ${normalized} já está na fila para "${produto}"`);
      return existing[0];
    }

    const { data, error } = await supabase
      .from('stock_waitlist')
      .insert({
        numero_cliente: normalized,
        nome_cliente: nome || null,
        produto_desejado: produto,
        data_pedido: new Date().toISOString(),
        notificado: false,
        vendido: false,
      })
      .select()
      .single();

    if (error) throw error;
    console.log(`[WAITLIST] Criado com sucesso: id=${data?.id || 'N/A'} | ${normalized} → "${produto}"`);
    return data;
  } catch (err) {
    console.error('[WAITLIST] ERRO:', err.message);
    return null;
  }
}

/**
 * Busca clientes na waitlist para um produto (não notificados, < 30 dias).
 * produto pode ser parcial (ex: "Netflix" inclui "Netflix Individual").
 */
async function getClientesPorNotificar(supabase, produto) {
  if (!supabase) return [];
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS_WAITLIST);

    const { data, error } = await supabase
      .from('stock_waitlist')
      .select('id, numero_cliente, nome_cliente, produto_desejado')
      .ilike('produto_desejado', `%${produto}%`)
      .eq('notificado', false)
      .eq('vendido', false)
      .gte('data_pedido', cutoff.toISOString())
      .order('data_pedido', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[WAITLIST] getClientesPorNotificar error:', err.message);
    return [];
  }
}

/**
 * Busca todos os produtos distintos na waitlist com pelo menos 1 cliente à espera.
 */
async function getProdutosEmEspera(supabase) {
  if (!supabase) return [];
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS_WAITLIST);

    const { data, error } = await supabase
      .from('stock_waitlist')
      .select('produto_desejado')
      .eq('notificado', false)
      .eq('vendido', false)
      .gte('data_pedido', cutoff.toISOString());

    if (error) throw error;

    // Extrair produtos únicos (normaliza para plataforma base: Netflix / Prime Video)
    const produtos = new Set();
    for (const row of (data || [])) {
      const p = (row.produto_desejado || '').toLowerCase();
      if (p.includes('netflix')) produtos.add('Netflix');
      if (p.includes('prime')) produtos.add('Prime Video');
    }
    return [...produtos];
  } catch (err) {
    console.error('[WAITLIST] getProdutosEmEspera error:', err.message);
    return [];
  }
}

/**
 * Marca uma lista de IDs como notificados.
 */
async function marcarNotificados(supabase, ids) {
  if (!supabase || !ids || ids.length === 0) return;
  try {
    const { error } = await supabase
      .from('stock_waitlist')
      .update({
        notificado: true,
        data_notificacao: new Date().toISOString(),
      })
      .in('id', ids);

    if (error) throw error;
    console.log(`[WAITLIST] ✅ ${ids.length} cliente(s) marcados como notificados`);
  } catch (err) {
    console.error('[WAITLIST] marcarNotificados error:', err.message);
  }
}

/**
 * Resumo da waitlist para o supervisor (#waitlist).
 */
async function getWaitlistResumo(supabase) {
  if (!supabase) return '❌ Supabase não configurado.';
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS_WAITLIST);

    const { data, error } = await supabase
      .from('stock_waitlist')
      .select('produto_desejado, notificado')
      .gte('data_pedido', cutoff.toISOString());

    if (error) throw error;
    const rows = data || [];

    const total = rows.length;
    const aguardando = rows.filter(r => !r.notificado).length;
    const notificados = rows.filter(r => r.notificado).length;

    const porProduto = {};
    for (const r of rows.filter(r => !r.notificado)) {
      const p = (r.produto_desejado || '').toLowerCase().includes('prime') ? 'Prime Video' : 'Netflix';
      porProduto[p] = (porProduto[p] || 0) + 1;
    }

    let msg = `📋 *Lista de Espera (últimos ${MAX_DAYS_WAITLIST} dias):*\n`;
    msg += `• Total: ${total}\n`;
    msg += `• Aguardando notificação: ${aguardando}\n`;
    msg += `• Já notificados: ${notificados}\n`;
    if (Object.keys(porProduto).length > 0) {
      msg += '\n*Por produto:*\n';
      for (const [prod, count] of Object.entries(porProduto)) {
        msg += `• ${prod}: ${count} cliente(s)\n`;
      }
    }
    return msg;
  } catch (err) {
    console.error('[WAITLIST] getWaitlistResumo error:', err.message);
    return '❌ Erro ao consultar lista de espera.';
  }
}

/**
 * Handler de comando #waitlist para supervisor.
 */
async function handleWaitlist(supabase, senderNum) {
  console.log('[CMD] #waitlist chamado por:', senderNum);
  if (!supabase) return '❌ Supabase não configurado.';
  try {
    return await getWaitlistResumo(supabase);
  } catch (err) {
    console.error('[WAITLIST] handleWaitlist error:', err.message);
    return '❌ Erro ao consultar lista de espera.';
  }
}

module.exports = {
  addToWaitlist,
  getClientesPorNotificar,
  getProdutosEmEspera,
  marcarNotificados,
  getWaitlistResumo,
  handleWaitlist,
};
