// src/integrations/supabase.js

const { createClient } = require('@supabase/supabase-js');
let supabase = null;

function init(url, key) {
  supabase = createClient(url, key);
}

function getClient() {
  return supabase;
}

module.exports = { init, getClient };
