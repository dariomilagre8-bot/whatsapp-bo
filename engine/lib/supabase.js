// engine/lib/supabase.js — proxy leve para o cliente Supabase inicializado em src/integrations/supabase.js
// Permite que módulos engine/ acedam ao Supabase sem duplicar a inicialização.

module.exports = {
  from(table) {
    const client = require('../../src/integrations/supabase').getClient();
    if (!client) throw new Error('[SUPABASE] Cliente não inicializado. Verificar SUPABASE_URL e SUPABASE_KEY.');
    return client.from(table);
  },
};
