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
 * Assume coluna "telefone" (ou "phone"). Retorna { customerName, isReturningCustomer }.
 */
async function getClientByPhone(phone) {
  if (!supabase) return { customerName: null, isReturningCustomer: false };
  const normalized = (phone || '').replace('@s.whatsapp.net', '').trim();
  if (!normalized) return { customerName: null, isReturningCustomer: false };
  try {
    let { data, error } = await supabase
      .from('clientes')
      .select('nome')
      .eq('telefone', normalized)
      .maybeSingle();
    if (error) throw error;
    if (!data && normalized.startsWith('244')) {
      const alt = normalized.replace(/^244/, '');
      const res = await supabase.from('clientes').select('nome').eq('telefone', alt).maybeSingle();
      if (!res.error) data = res.data;
    }
    if (error) {
      console.error('[SUPABASE] getClientByPhone:', error.message);
      return { customerName: null, isReturningCustomer: false };
    }
    const customerName = (data && data.nome) || null;
    return { customerName, isReturningCustomer: !!data };
  } catch (err) {
    console.error('[SUPABASE] getClientByPhone:', err.message);
    return { customerName: null, isReturningCustomer: false };
  }
}

module.exports = { init, getClient, getClientByPhone };
