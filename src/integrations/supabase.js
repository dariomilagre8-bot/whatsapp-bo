// src/integrations/supabase.js

const { createClient } = require('@supabase/supabase-js');
let supabase = null;

function init(url, key) {
  supabase = createClient(url, key);
}

function getClient() {
  return supabase;
}

/**
 * Busca cliente na tabela clientes pelo número de WhatsApp e a venda activa mais recente (com data_expiracao).
 * Retorna lastSale: { data_expiracao, plataforma, plano } ou null se não houver vendas com data_expiracao.
 */
async function getClientByPhone(phone) {
  if (!supabase) return { customerName: null, isReturningCustomer: false, lastSale: null };
  const normalized = (phone || '').replace('@s.whatsapp.net', '').trim();
  if (!normalized) return { customerName: null, isReturningCustomer: false, lastSale: null };

  try {
    let { data, error } = await supabase
      .from('clientes')
      .select('id, nome')
      .eq('whatsapp', normalized)
      .maybeSingle();
    if (error) throw error;

    if (!data && normalized.startsWith('244')) {
      const alt = normalized.replace(/^244/, '');
      const res = await supabase
        .from('clientes')
        .select('id, nome')
        .eq('whatsapp', alt)
        .maybeSingle();
      if (!res.error && res.data) data = res.data;
    }

    const customerName = (data && data.nome) || null;
    let lastSale = null;

    // Venda mais recente com data_expiracao (por whatsapp ou por cliente_id)
    try {
      const { data: vendasRows, error: vendasError } = await supabase
        .from('vendas')
        .select('data_expiracao, plataforma, plano')
        .eq('whatsapp', normalized)
        .not('data_expiracao', 'is', null)
        .order('data_expiracao', { ascending: false })
        .limit(1);
      if (!vendasError && vendasRows && vendasRows.length > 0 && vendasRows[0].data_expiracao) {
        const v = vendasRows[0];
        lastSale = { data_expiracao: v.data_expiracao, plataforma: v.plataforma || null, plano: v.plano || null };
      }
    } catch (_) {
      // Tabela vendas ou coluna data_expiracao podem não existir
    }

    if (!lastSale && normalized.startsWith('244')) {
      try {
        const alt = normalized.replace(/^244/, '');
        const { data: vendasRows2, error: e2 } = await supabase
          .from('vendas')
          .select('data_expiracao, plataforma, plano')
          .eq('whatsapp', alt)
          .not('data_expiracao', 'is', null)
          .order('data_expiracao', { ascending: false })
          .limit(1);
        if (!e2 && vendasRows2 && vendasRows2.length > 0 && vendasRows2[0].data_expiracao) {
          const v = vendasRows2[0];
          lastSale = { data_expiracao: v.data_expiracao, plataforma: v.plataforma || null, plano: v.plano || null };
        }
      } catch (_) {}
    }

    // Fallback: se vendas tem cliente_id em vez de whatsapp
    if (!lastSale && data && data.id) {
      try {
        const { data: vendasRows3, error: e3 } = await supabase
          .from('vendas')
          .select('data_expiracao, plataforma, plano')
          .eq('cliente_id', data.id)
          .not('data_expiracao', 'is', null)
          .order('data_expiracao', { ascending: false })
          .limit(1);
        if (!e3 && vendasRows3 && vendasRows3.length > 0 && vendasRows3[0].data_expiracao) {
          const v = vendasRows3[0];
          lastSale = { data_expiracao: v.data_expiracao, plataforma: v.plataforma || null, plano: v.plano || null };
        }
      } catch (_) {}
    }

    return { customerName, isReturningCustomer: !!data, lastSale };
  } catch (err) {
    console.error('[SUPABASE] getClientByPhone:', err.message);
    return { customerName: null, isReturningCustomer: false, lastSale: null };
  }
}

module.exports = { init, getClient, getClientByPhone };
