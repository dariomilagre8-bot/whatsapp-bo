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
 * Busca cliente na tabela clientes pelo número de WhatsApp.
 * Tenta colunas "whatsapp", "phone" e "telefone" para compatibilidade com diferentes esquemas.
 */
async function getClientByPhone(phone) {
  if (!supabase) return { customerName: null, isReturningCustomer: false };
  const normalized = (phone || '').replace('@s.whatsapp.net', '').trim();
  if (!normalized) return { customerName: null, isReturningCustomer: false };

  const columnsToTry = ['whatsapp', 'phone', 'telefone'];

  const tryQuery = async (column) => {
    const { data, error } = await supabase
      .from('clientes')
      .select('nome')
      .eq(column, normalized)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  try {
    let data = null;
    for (const col of columnsToTry) {
      try {
        data = await tryQuery(col);
        if (data) break;
      } catch (e) {
        if (e.code === 'PGRST204' || e.message && e.message.includes('does not exist')) continue;
        throw e;
      }
    }
    if (!data && normalized.startsWith('244')) {
      const alt = normalized.replace(/^244/, '');
      for (const col of columnsToTry) {
        try {
          const res = await supabase.from('clientes').select('nome').eq(col, alt).maybeSingle();
          if (!res.error && res.data) { data = res.data; break; }
        } catch (_) { continue; }
      }
    }
    const customerName = (data && data.nome) || null;
    return { customerName, isReturningCustomer: !!data };
  } catch (err) {
    console.error('[SUPABASE] getClientByPhone:', err.message);
    return { customerName: null, isReturningCustomer: false };
  }
}

module.exports = { init, getClient, getClientByPhone };
