/**
 * Cria tabelas de teste no Supabase (schema idêntico às de produção).
 * Uso: node scripts/setup-test-db.js
 *
 * Como o cliente Supabase JS não permite DDL directamente,
 * este script imprime o SQL que o Don deve colar no Supabase SQL Editor.
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.test') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function setup() {
  console.log('🔧 A preparar tabelas de teste no Supabase...');
  console.log(`   URL: ${process.env.SUPABASE_URL}`);
  console.log('');

  const sql = `
-- ============================================================
-- EXECUTAR NO SUPABASE SQL EDITOR
-- https://supabase.com/dashboard → SQL Editor → New query
-- Copiar e colar tudo de uma vez, depois clicar em "Run"
-- ============================================================

CREATE TABLE IF NOT EXISTS clientes_teste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  whatsapp text NOT NULL UNIQUE,
  email text,
  criado_em timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendas_teste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes_teste(id),
  whatsapp text,
  plataforma text,
  plano text,
  quantidade int DEFAULT 1,
  valor_total numeric,
  data_venda date DEFAULT current_date,
  data_expiracao date,
  status text DEFAULT 'activa'
);

CREATE TABLE IF NOT EXISTS perfis_entregues_teste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid REFERENCES vendas_teste(id),
  email_conta text,
  senha_conta text,
  nome_perfil text,
  pin text,
  plataforma text,
  entregue_em timestamptz DEFAULT now()
);

-- Habilitar RLS (Row Level Security) igual ao de produção
ALTER TABLE clientes_teste ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas_teste ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfis_entregues_teste ENABLE ROW LEVEL SECURITY;

-- Policies para service_role (igual ao de produção)
CREATE POLICY "service_role_all_clientes_teste"
  ON clientes_teste FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_vendas_teste"
  ON vendas_teste FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_perfis_teste"
  ON perfis_entregues_teste FOR ALL USING (true) WITH CHECK (true);
`;

  console.log('📋 COPIAR O SQL ABAIXO E COLAR NO SUPABASE SQL EDITOR:\n');
  console.log(sql);
  console.log('');
  console.log('✅ Após executar o SQL, as tabelas de teste estarão prontas.');
  console.log('   Próximo passo: npm run setup:test-sheet');

  // Verificar conectividade ao Supabase
  try {
    const { error } = await supabase.from('clientes').select('id').limit(1);
    if (!error) {
      console.log('\n✅ Ligação ao Supabase OK — credenciais funcionam.');
    } else {
      console.warn('\n⚠️  Aviso Supabase:', error.message);
    }
  } catch (e) {
    console.warn('\n⚠️  Não foi possível verificar ligação ao Supabase:', e.message);
  }
}

setup().catch(console.error);
