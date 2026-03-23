// engine/lib/crm.js — CRM genérico baseado na tabela pa_clients (Supabase pa-engine)
// Classificação: new_lead | active | expired | cancelled | trial

const supabase = require('./supabase');

/**
 * Devolve o registo do cliente em pa_clients pelo número de telefone,
 * ou null se não existir (lead novo).
 * @param {string} phone
 * @returns {Promise<object|null>}
 */
async function getClientByPhone(phone) {
  const normalized = phone.replace(/\D/g, '');
  const { data, error } = await supabase
    .from('pa_clients')
    .select('*')
    .eq('phone', normalized)
    .maybeSingle();
  if (error) throw error;
  return data; // null = lead novo
}

/**
 * Classifica um cliente conforme o seu estado em pa_clients.
 * @param {object|null} client — registo de pa_clients ou null
 * @returns {'new_lead'|'active'|'expired'|'cancelled'|'trial'}
 */
function classifyClient(client) {
  if (!client) return 'new_lead';
  if (client.status === 'expired') return 'expired';
  if (client.status === 'cancelled') return 'cancelled';
  if (client.status === 'trial') return 'trial';
  return 'active';
}

module.exports = { getClientByPhone, classifyClient };
