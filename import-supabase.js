/**
 * import-supabase.js — Migração de dados para o Supabase
 *
 * Popula as tabelas `clientes` e `vendas` com os dados de Fevereiro 2026:
 *   - 17 clientes activos
 *   - 20 clientes antigos (a_verificar)
 *   - 19 vendas (receita total: 114.000 Kz)
 *
 * Execução: node import-supabase.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY não definidos no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ── Clientes Activos (17) ──────────────────────────────────────────────────────
const CLIENTES_ACTIVOS = [
  { nome: 'Hibraina',           whatsapp: '244946430525' },
  { nome: 'Bruna Simão',        whatsapp: '244938650901' },
  { nome: 'Barbara Casimiro',   whatsapp: '244923335740' },
  { nome: 'Georgina Henriques', whatsapp: '244939000799' },
  { nome: 'Joni P e RP',        whatsapp: '244926332364' },
  { nome: 'Heliane',            whatsapp: '244936475918' },
  { nome: 'Gutho Monteiro',     whatsapp: '244924539250' },
  { nome: 'Julia Saraiva',      whatsapp: '244925221793' },
  { nome: 'Luquinda',           whatsapp: '244922232215' },
  { nome: 'Mirian António',     whatsapp: '244937183929' },
  { nome: 'Sandra dos Santos',  whatsapp: '244947364487' },
  { nome: 'Mom Da Tchissola',   whatsapp: '244923733641' },
  { nome: 'Dádiva Victória',    whatsapp: '244928974999' },
  { nome: 'Camila Paula',       whatsapp: '244949643888' },
  { nome: 'Jeovânia António',   whatsapp: '244934085804' },
  { nome: 'Gersol Pascoal',     whatsapp: '244923842752' },
  { nome: 'Maurio',             whatsapp: '244927846165' },
];

// ── Clientes Antigos / a_verificar (20) ───────────────────────────────────────
const CLIENTES_ANTIGOS = [
  { nome: 'Alicia',            whatsapp: '244924295290' },
  { nome: 'Balbina Nunda',     whatsapp: '244949086346' },
  { nome: 'Bermy Ramos',       whatsapp: '244930557495' },
  { nome: 'Débora Chipangue',  whatsapp: '244923849606' },
  { nome: 'Dicaprio Seixas',   whatsapp: '244944312082' },
  { nome: 'Djamila',           whatsapp: '244923430214' },
  { nome: 'Domingas',          whatsapp: '244947142028' },
  { nome: 'Eduardo',           whatsapp: '244944683350' },
  { nome: 'Elisandra Luango',  whatsapp: '244935962547' },
  { nome: 'Elizabeth Almeida', whatsapp: '244923346780' },
  { nome: 'Evandra Fula',      whatsapp: '244939099119' },
  { nome: 'Família',           whatsapp: '244996420734' },
  { nome: 'Flávia Filipe',     whatsapp: '244923582704' },
  { nome: 'Isaura Vissenga',   whatsapp: '351926137576' },
  { nome: 'Jacinto',           whatsapp: '244943489388' },
  { nome: 'Janiva',            whatsapp: '244924061705' },
  { nome: 'Javaloa',           whatsapp: '244929370698' },
  { nome: 'Lpeixoto',          whatsapp: '244923585802' },
  { nome: 'Mirna',             whatsapp: '244924190555' },
  { nome: 'Nyra',              whatsapp: '244943077043' },
];

// ── Vendas (19) ────────────────────────────────────────────────────────────────
const VENDAS_RAW = [
  { whatsapp: '244946430525', plataforma: 'Netflix',     plano: 'Familia',          quantidade: 3, valor_total: 13500 },
  { whatsapp: '244938650901', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244923335740', plataforma: 'Netflix',     plano: 'Familia_Completa',  quantidade: 5, valor_total: 13500 },
  { whatsapp: '244939000799', plataforma: 'Netflix',     plano: 'Partilha',          quantidade: 2, valor_total:  9000 },
  { whatsapp: '244926332364', plataforma: 'Netflix',     plano: 'Partilha',          quantidade: 2, valor_total:  9000 },
  { whatsapp: '244936475918', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244924539250', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244925221793', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244922232215', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244937183929', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244947364487', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244923733641', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244928974999', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244949643888', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244934085804', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244923842752', plataforma: 'Netflix',     plano: 'Individual',        quantidade: 1, valor_total:  5000 },
  { whatsapp: '244923335740', plataforma: 'Prime Video', plano: 'Individual',        quantidade: 1, valor_total:  3000 },
  { whatsapp: '244927846165', plataforma: 'Prime Video', plano: 'Individual',        quantidade: 1, valor_total:  3000 },
  { whatsapp: '244922232215', plataforma: 'Prime Video', plano: 'Individual',        quantidade: 1, valor_total:  3000 },
];

async function main() {
  console.log('\n🚀 StreamZone — Migração para Supabase');
  console.log(`   URL : ${supabaseUrl}`);
  console.log('');

  // ── 1. Limpar tabelas (vendas primeiro por causa da FK) ──────────────────────
  console.log('🧹 Limpando tabelas...');

  const { error: errDelVendas } = await supabase
    .from('vendas')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (errDelVendas) throw new Error(`Erro ao limpar vendas: ${errDelVendas.message}`);
  console.log('   ✅ vendas limpa');

  const { error: errDelClientes } = await supabase
    .from('clientes')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (errDelClientes) throw new Error(`Erro ao limpar clientes: ${errDelClientes.message}`);
  console.log('   ✅ clientes limpa\n');

  // ── 2. Inserir todos os clientes (37) ────────────────────────────────────────
  const todosClientes = [
    ...CLIENTES_ACTIVOS.map(c => ({ ...c, criado_em: '2026-02-28T00:00:00Z' })),
    ...CLIENTES_ANTIGOS,
  ];

  console.log(`📋 Inserindo ${todosClientes.length} clientes...`);
  const { data: clientesInseridos, error: errClientes } = await supabase
    .from('clientes')
    .insert(todosClientes)
    .select();

  if (errClientes) throw new Error(`Erro ao inserir clientes: ${errClientes.message}`);
  console.log(`   ✅ ${clientesInseridos.length} clientes inseridos\n`);

  // ── 3. Mapear whatsapp → UUID ────────────────────────────────────────────────
  const mapaClientes = {};
  for (const c of clientesInseridos) {
    mapaClientes[c.whatsapp] = c.id;
  }

  // ── 4. Inserir vendas (19) ───────────────────────────────────────────────────
  const vendasParaInserir = VENDAS_RAW.map(v => ({
    cliente_id:     mapaClientes[v.whatsapp] || null,
    whatsapp:       v.whatsapp,
    plataforma:     v.plataforma,
    plano:          v.plano,
    quantidade:     v.quantidade,
    valor_total:    v.valor_total,
    data_venda:     '2026-02-28T00:00:00Z',
    data_expiracao: '2026-03-31T23:59:59Z',
    status:         'ativo',
  }));

  console.log(`💰 Inserindo ${vendasParaInserir.length} vendas...`);
  const { data: vendasInseridas, error: errVendas } = await supabase
    .from('vendas')
    .insert(vendasParaInserir)
    .select();

  if (errVendas) throw new Error(`Erro ao inserir vendas: ${errVendas.message}`);
  console.log(`   ✅ ${vendasInseridas.length} vendas inseridas\n`);

  // ── 5. Verificação final ─────────────────────────────────────────────────────
  console.log('🔍 Verificando...');

  const { count: totalClientes } = await supabase
    .from('clientes')
    .select('*', { count: 'exact', head: true });

  const { count: totalVendas } = await supabase
    .from('vendas')
    .select('*', { count: 'exact', head: true });

  const { data: receitaData } = await supabase
    .from('vendas')
    .select('valor_total')
    .eq('status', 'ativo');

  const receita = (receitaData || []).reduce((sum, v) => sum + v.valor_total, 0);

  const okClientes = totalClientes === 37;
  const okVendas   = totalVendas   === 19;
  const okReceita  = receita       === 114000;

  console.log(`   Clientes : ${totalClientes} ${okClientes ? '✅' : '❌'} (esperado: 37)`);
  console.log(`   Vendas   : ${totalVendas}   ${okVendas   ? '✅' : '❌'} (esperado: 19)`);
  console.log(`   Receita  : ${receita.toLocaleString('pt-PT')} Kz ${okReceita ? '✅' : '❌'} (esperado: 114.000 Kz)`);
  console.log('');

  if (okClientes && okVendas && okReceita) {
    console.log('🎉 Migração concluída com sucesso!');
    console.log('   Dashboard /admin: 17 clientes activos | 114.000 Kz receita');
  } else {
    console.log('⚠️  Alguns valores diferem do esperado — verifica os dados no Supabase');
  }
}

main().catch(err => {
  console.error('\n❌ Erro:', err.message);
  process.exit(1);
});
