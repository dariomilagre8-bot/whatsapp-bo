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
  { nome: 'Hibraina',           telefone: '244946430525', status: 'activo' },
  { nome: 'Bruna Simão',        telefone: '244938650901', status: 'activo' },
  { nome: 'Barbara Casimiro',   telefone: '244923335740', status: 'activo' },
  { nome: 'Georgina Henriques', telefone: '244939000799', status: 'activo' },
  { nome: 'Joni P e RP',        telefone: '244926332364', status: 'activo' },
  { nome: 'Heliane',            telefone: '244936475918', status: 'activo' },
  { nome: 'Gutho Monteiro',     telefone: '244924539250', status: 'activo' },
  { nome: 'Julia Saraiva',      telefone: '244925221793', status: 'activo' },
  { nome: 'Luquinda',           telefone: '244922232215', status: 'activo' },
  { nome: 'Mirian António',     telefone: '244937183929', status: 'activo' },
  { nome: 'Sandra dos Santos',  telefone: '244947364487', status: 'activo' },
  { nome: 'Mom Da Tchissola',   telefone: '244923733641', status: 'activo' },
  { nome: 'Dádiva Victória',    telefone: '244928974999', status: 'activo' },
  { nome: 'Camila Paula',       telefone: '244949643888', status: 'activo' },
  { nome: 'Jeovânia António',   telefone: '244934085804', status: 'activo' },
  { nome: 'Gersol Pascoal',     telefone: '244923842752', status: 'activo' },
  { nome: 'Maurio',             telefone: '244927846165', status: 'activo' },
];

// ── Clientes Antigos / a_verificar (20) ───────────────────────────────────────
const CLIENTES_ANTIGOS = [
  { nome: 'Alicia',            telefone: '244924295290', status: 'a_verificar' },
  { nome: 'Balbina Nunda',     telefone: '244949086346', status: 'a_verificar' },
  { nome: 'Bermy Ramos',       telefone: '244930557495', status: 'a_verificar' },
  { nome: 'Débora Chipangue',  telefone: '244923849606', status: 'a_verificar' },
  { nome: 'Dicaprio Seixas',   telefone: '244944312082', status: 'a_verificar' },
  { nome: 'Djamila',           telefone: '244923430214', status: 'a_verificar' },
  { nome: 'Domingas',          telefone: '244947142028', status: 'a_verificar' },
  { nome: 'Eduardo',           telefone: '244944683350', status: 'a_verificar' },
  { nome: 'Elisandra Luango',  telefone: '244935962547', status: 'a_verificar' },
  { nome: 'Elizabeth Almeida', telefone: '244923346780', status: 'a_verificar' },
  { nome: 'Evandra Fula',      telefone: '244939099119', status: 'a_verificar' },
  { nome: 'Família',           telefone: '244996420734', status: 'a_verificar' },
  { nome: 'Flávia Filipe',     telefone: '244923582704', status: 'a_verificar' },
  { nome: 'Isaura Vissenga',   telefone: '351926137576', status: 'a_verificar' },
  { nome: 'Jacinto',           telefone: '244943489388', status: 'a_verificar' },
  { nome: 'Janiva',            telefone: '244924061705', status: 'a_verificar' },
  { nome: 'Javaloa',           telefone: '244929370698', status: 'a_verificar' },
  { nome: 'Lpeixoto',          telefone: '244923585802', status: 'a_verificar' },
  { nome: 'Mirna',             telefone: '244924190555', status: 'a_verificar' },
  { nome: 'Nyra',              telefone: '244943077043', status: 'a_verificar' },
];

// ── Vendas (19) ────────────────────────────────────────────────────────────────
const VENDAS_RAW = [
  { telefone: '244946430525', plataforma: 'Netflix',     plano: 'Familia',         perfis: 3, valor: 13500 },
  { telefone: '244938650901', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244923335740', plataforma: 'Netflix',     plano: 'Familia_Completa', perfis: 5, valor: 13500 },
  { telefone: '244939000799', plataforma: 'Netflix',     plano: 'Partilha',         perfis: 2, valor:  9000 },
  { telefone: '244926332364', plataforma: 'Netflix',     plano: 'Partilha',         perfis: 2, valor:  9000 },
  { telefone: '244936475918', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244924539250', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244925221793', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244922232215', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244937183929', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244947364487', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244923733641', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244928974999', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244949643888', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244934085804', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244923842752', plataforma: 'Netflix',     plano: 'Individual',       perfis: 1, valor:  5000 },
  { telefone: '244923335740', plataforma: 'Prime Video', plano: 'Individual',       perfis: 1, valor:  3000 },
  { telefone: '244927846165', plataforma: 'Prime Video', plano: 'Individual',       perfis: 1, valor:  3000 },
  { telefone: '244922232215', plataforma: 'Prime Video', plano: 'Individual',       perfis: 1, valor:  3000 },
];

// ── Helper: probe de coluna via SELECT ────────────────────────────────────────
async function colExists(table, col) {
  const { error } = await supabase.from(table).select(col).limit(1);
  // Se a coluna não existe, Supabase devolve erro com "does not exist" na mensagem
  return !error || !error.message?.toLowerCase().includes('does not exist');
}

// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n🚀 StreamZone — Migração para Supabase');
  console.log(`   URL : ${supabaseUrl}\n`);

  // ── STEP 1: Verificar schema real ────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════════');
  console.log(' STEP 1 — Verificar schema real (SEM inserir dados)');
  console.log('══════════════════════════════════════════════════════\n');

  const TABLES = ['clientes', 'vendas', 'perfis_entregues'];
  const schemaAcessivel = {};

  for (const t of TABLES) {
    const { error } = await supabase.from(t).select('*').limit(0);
    schemaAcessivel[t] = !error;
    console.log(`  Tabela "${t}": ${!error ? '✅ acessível' : `❌ ${error.message}`}`);
  }

  console.log('\n  Colunas detectadas:');

  const colChecks = {
    clientes: ['id', 'nome', 'whatsapp', 'status', 'email', 'criado_em'],
    vendas:   ['id', 'cliente_id', 'whatsapp', 'plataforma', 'plano',
                'quantidade', 'valor_total', 'data_venda', 'data_expiracao', 'status'],
  };

  const schema = { clientes: {}, vendas: {} };

  for (const [table, cols] of Object.entries(colChecks)) {
    if (!schemaAcessivel[table]) {
      console.log(`  (tabela ${table} não acessível — a saltar)`);
      continue;
    }
    for (const col of cols) {
      const existe = await colExists(table, col);
      schema[table][col] = existe;
      console.log(`    ${table}.${col}: ${existe ? '✅ existe' : '⚠️  não existe'}`);
    }
  }

  // Determinar qual campo usar para número de telefone em clientes
  const campoTel = schema.clientes.whatsapp ? 'whatsapp'
                 : schema.clientes.telefone  ? 'telefone'
                 : null;

  if (!campoTel) {
    throw new Error('Nenhuma coluna de telefone encontrada em clientes (whatsapp / telefone)');
  }

  const hasClienteStatus = !!schema.clientes.status;
  console.log(`\n  Campo telefone detectado: "${campoTel}"`);
  console.log(`  Coluna clientes.status: ${hasClienteStatus ? '✅ existe — será usada' : '⚠️  não existe — será omitida'}`);
  console.log('\n  STEP 1 concluído. Nenhum dado inserido.\n');

  // ── STEP 2: Limpar dados antigos ──────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════════');
  console.log(' STEP 2 — Limpar dados antigos');
  console.log('══════════════════════════════════════════════════════\n');

  const { error: errDelVendas } = await supabase
    .from('vendas')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (errDelVendas) throw new Error(`Erro ao limpar vendas: ${errDelVendas.message}`);
  console.log('  ✅ vendas limpa');

  const { error: errDelClientes } = await supabase
    .from('clientes')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (errDelClientes) throw new Error(`Erro ao limpar clientes: ${errDelClientes.message}`);
  console.log('  ✅ clientes limpa\n');

  // ── STEP 3: Inserir 37 clientes ───────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════════');
  console.log(' STEP 3 — Inserir 37 clientes');
  console.log('══════════════════════════════════════════════════════\n');

  const todosClientes = [
    ...CLIENTES_ACTIVOS,
    ...CLIENTES_ANTIGOS,
  ];

  // Construir objectos adaptados ao schema real
  const clientesParaInserir = todosClientes.map(c => {
    const obj = {
      nome:        c.nome,
      [campoTel]:  c.telefone,
      criado_em:   '2026-02-28T00:00:00Z',
    };
    if (hasClienteStatus) obj.status = c.status;
    return obj;
  });

  console.log(`  A inserir ${clientesParaInserir.length} clientes...`);
  const { data: clientesInseridos, error: errClientes } = await supabase
    .from('clientes')
    .insert(clientesParaInserir)
    .select();

  if (errClientes) throw new Error(`Erro ao inserir clientes: ${errClientes.message}`);
  console.log(`  ✅ ${clientesInseridos.length} clientes inseridos\n`);

  // ── Mapear telefone → UUID ───────────────────────────────────────────────────
  const mapaClientes = {};
  for (const c of clientesInseridos) {
    mapaClientes[c[campoTel]] = c.id;
  }

  // ── STEP 4: Inserir 19 vendas ─────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════════');
  console.log(' STEP 4 — Inserir 19 vendas');
  console.log('══════════════════════════════════════════════════════\n');

  // Campo whatsapp em vendas pode não existir — usar se disponível
  const vendasTemWhatsapp = !!schema.vendas.whatsapp;

  const vendasParaInserir = VENDAS_RAW.map(v => {
    const clienteId = mapaClientes[v.telefone] || null;
    if (!clienteId) {
      throw new Error(`Cliente não encontrado para telefone ${v.telefone}`);
    }
    const obj = {
      cliente_id:     clienteId,
      plataforma:     v.plataforma,
      plano:          v.plano,
      quantidade:     v.perfis,
      valor_total:    v.valor,
      data_venda:     '2026-02-28T00:00:00Z',
      data_expiracao: '2026-03-31T23:59:59Z',
      status:         'ativo',
    };
    if (vendasTemWhatsapp) obj.whatsapp = v.telefone;
    return obj;
  });

  console.log(`  A inserir ${vendasParaInserir.length} vendas...`);
  const { data: vendasInseridas, error: errVendas } = await supabase
    .from('vendas')
    .insert(vendasParaInserir)
    .select();

  if (errVendas) throw new Error(`Erro ao inserir vendas: ${errVendas.message}`);
  console.log(`  ✅ ${vendasInseridas.length} vendas inseridas\n`);

  // ── STEP 5: Verificar resultado ───────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════════');
  console.log(' STEP 5 — Verificar resultado');
  console.log('══════════════════════════════════════════════════════\n');

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

  console.log(`  Clientes : ${totalClientes} ${okClientes ? '✅' : '❌'} (esperado: 37)`);
  console.log(`  Vendas   : ${totalVendas}   ${okVendas   ? '✅' : '❌'} (esperado: 19)`);
  console.log(`  Receita  : ${receita.toLocaleString('pt-PT')} Kz ${okReceita ? '✅' : '❌'} (esperado: 114.000 Kz)`);

  // Primeiros 5 clientes activos
  const filtro = hasClienteStatus
    ? supabase.from('clientes').select('nome, ' + campoTel + ', status').eq('status', 'activo').limit(5)
    : supabase.from('clientes').select('nome, ' + campoTel).limit(5);
  const { data: primeiros5 } = await filtro;

  console.log('\n  Primeiros 5 clientes activos:');
  (primeiros5 || []).forEach((c, i) => {
    console.log(`    ${i + 1}. ${c.nome} — ${c[campoTel]}${hasClienteStatus ? ' (' + c.status + ')' : ''}`);
  });

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
