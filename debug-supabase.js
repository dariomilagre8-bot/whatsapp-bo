require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('\n=== 1. SELECT * FROM vendas LIMIT 5 ===');
  const { data: v, error: ev } = await supabase.from('vendas').select('*').limit(5);
  if (ev) console.error('ERRO vendas:', ev);
  else console.log(JSON.stringify(v, null, 2));

  console.log('\n=== 2. SELECT * FROM clientes LIMIT 5 ===');
  const { data: c, error: ec } = await supabase.from('clientes').select('*').limit(5);
  if (ec) console.error('ERRO clientes:', ec);
  else console.log(JSON.stringify(c, null, 2));

  console.log('\n=== 3. COUNT e SUM de vendas ===');
  const { count: cnt } = await supabase.from('vendas').select('*', { count: 'exact', head: true });
  const { data: soma } = await supabase.from('vendas').select('valor_total');
  const total = (soma || []).reduce((s, r) => s + (r.valor_total || 0), 0);
  console.log(`COUNT: ${cnt}  |  SUM valor_total: ${total}`);

  console.log('\n=== 4. DISTINCT status FROM vendas ===');
  const { data: statuses, error: es } = await supabase.from('vendas').select('status');
  if (es) console.error('ERRO status:', es);
  else {
    const distinct = [...new Set((statuses || []).map(r => r.status))];
    console.log('Valores distintos de status:', JSON.stringify(distinct));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
