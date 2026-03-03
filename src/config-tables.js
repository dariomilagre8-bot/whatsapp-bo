// Centraliza os nomes das tabelas Supabase (produção vs teste)
// Em modo teste (NODE_ENV=test), usa tabelas isoladas para nunca tocar nos dados reais.

const IS_TEST = process.env.NODE_ENV === 'test';

const TABLES = {
  CLIENTES: IS_TEST ? 'clientes_teste' : 'clientes',
  VENDAS: IS_TEST ? 'vendas_teste' : 'vendas',
  PERFIS: IS_TEST ? 'perfis_entregues_teste' : 'perfis_entregues',
};

module.exports = { IS_TEST, TABLES };
