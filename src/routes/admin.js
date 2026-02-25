// Rotas GET/POST /api/admin/* — painel admin (x-admin-secret)
const express = require('express');
const cors = require('cors');
const config = require('../config');
const estados = require('../utils/estados');
const { sendWhatsAppMessage } = require('../whatsapp');
const supervisorHandler = require('../handlers/supervisor');
const {
  fetchAllRows,
  countAvailableProfiles,
  markProfileAvailable,
  isIndisponivel,
} = require('../../googleSheets');
const { supabase } = require('../../supabase');
const branding = require('../../branding');
const notif = require('../utils/notificacoes');
const expiracaoModulo = require('../../expiracao-modulo');

const { CATALOGO, MAIN_BOSS } = config;
const { clientStates, chatHistories, pendingVerifications, pausedClients, initClientState } = estados;
const { processApproval, processRejection } = supervisorHandler;
const { lostSales } = notif;

const router = express.Router();

router.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-secret'],
}));
router.options('*', cors());

router.use((req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  const adminSecret = process.env.ADMIN_SECRET || 'streamzone2026';
  if (!secret || secret !== adminSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

router.get('/stats', (req, res) => {
  const pendingEntries = Object.entries(pendingVerifications);
  const pendingCount = pendingEntries.length;
  const valorEmRisco = pendingEntries.reduce((sum, [, p]) => sum + (p.totalValor || 0), 0);
  const activeChats = Object.values(clientStates).filter(s => s.step && s.step !== 'inicio').length;
  const lostSalesPending = lostSales.filter(s => !s.recovered).length;
  const lostSalesTotal = lostSales.length;
  res.json({ stats: { pendingCount, activeChats, valorEmRisco, lostSalesPending, lostSalesTotal } });
});

router.get('/pending', (req, res) => {
  const pending = Object.entries(pendingVerifications).map(([phone, p]) => ({
    phone,
    clientName: p.clientName || '',
    cart: p.cart || [],
    totalValor: p.totalValor || 0,
    timestamp: p.timestamp || Date.now(),
    fromWebsite: p.fromWebsite || false,
    isRenewal: p.isRenewal || false,
  }));
  res.json({ pending });
});

router.post('/approve', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  if (!pendingVerifications[phone]) return res.status(404).json({ error: 'not_found' });
  try {
    const result = await processApproval(phone, null);
    res.json({ success: true, allSuccess: result.allSuccess });
  } catch (e) {
    console.error('Erro admin approve:', e.message);
    res.status(500).json({ error: 'Erro ao processar aprovação.' });
  }
});

router.post('/reject', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  try {
    await processRejection(phone, null);
    res.json({ success: true });
  } catch (e) {
    console.error('Erro admin reject:', e.message);
    res.status(500).json({ error: 'Erro ao rejeitar.' });
  }
});

router.get('/stock', async (req, res) => {
  try {
    const stock = {};
    for (const [key, svc] of Object.entries(CATALOGO)) {
      const shared = await countAvailableProfiles(svc.nome, 'shared_profile') || 0;
      const full = await countAvailableProfiles(svc.nome, 'full_account') || 0;
      stock[key] = { nome: svc.nome, emoji: svc.emoji, available: shared + full, shared, full };
    }
    res.json({ stock });
  } catch (e) {
    console.error('Erro admin stock:', e.message);
    res.status(500).json({ error: 'Erro ao carregar stock.' });
  }
});

router.get('/lost-sales', (req, res) => {
  res.json({ lostSales });
});

router.post('/recover', async (req, res) => {
  const { saleId, message } = req.body;
  const sale = lostSales.find(s => s.id === saleId && !s.recovered);
  if (!sale) return res.status(404).json({ error: 'not_found' });
  sale.recovered = true;
  delete pausedClients[sale.phone];
  clientStates[sale.phone] = initClientState({ step: 'escolha_servico', clientName: sale.clientName });
  const msg = message || `Olá${sale.clientName ? ' ' + sale.clientName : ''}! 😊 Notámos que ficou interessado nos nossos serviços. Ainda podemos ajudar?\n\n🎬 *Netflix*\n📺 *Prime Video*`;
  await sendWhatsAppMessage(sale.phone, msg);
  res.json({ success: true });
});

router.get('/expiracoes', async (req, res) => {
  try {
    const rows = await fetchAllRows();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const expiracoes = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const plataforma = row[0] || '';
      const nomePerfil = row[3] || '';
      const status = row[5] || '';
      const cliente = row[6] || '';
      const phone = (row[7] || '').toString().replace(/\D/g, '');
      const dataVendaStr = row[8] || '';
      const plano = row[12] || nomePerfil;
      if (!isIndisponivel(status) || !cliente || !dataVendaStr) continue;
      const parts = dataVendaStr.split('/');
      if (parts.length !== 3) continue;
      const dataVenda = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (isNaN(dataVenda.getTime())) continue;
      const expiry = new Date(dataVenda);
      expiry.setDate(expiry.getDate() + 30);
      expiry.setHours(0, 0, 0, 0);
      const diasRestantes = Math.round((expiry - today) / msPerDay);
      if (diasRestantes > 7) continue;
      let estado;
      if (diasRestantes < 0) estado = 'expirado';
      else if (diasRestantes <= 3) estado = 'urgente';
      else estado = 'aviso';
      expiracoes.push({ id: i + 1, nome: cliente, phone, plataforma, plano, diasRestantes, estado, dataVenda: dataVendaStr });
    }
    expiracoes.sort((a, b) => a.diasRestantes - b.diasRestantes);
    res.json({ expiracoes, fonte: 'sheet' });
  } catch (err) {
    console.error('Erro GET /expiracoes:', err.message);
    res.status(500).json({ error: 'Erro ao ler expirações' });
  }
});

router.get('/expiracoes-db', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado', fallback: true });
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const { data: vendas, error } = await supabase
      .from('vendas')
      .select('id, plataforma, plano, data_expiracao, data_venda, valor_total, clientes(nome, whatsapp)')
      .eq('status', 'ativo')
      .order('data_expiracao', { ascending: true });
    if (error) throw new Error(error.message);
    const expiracoes = [];
    for (const v of (vendas || [])) {
      if (!v.data_expiracao) continue;
      const expiry = new Date(v.data_expiracao);
      expiry.setHours(0, 0, 0, 0);
      const diasRestantes = Math.round((expiry - today) / msPerDay);
      if (diasRestantes > 7) continue;
      let estado;
      if (diasRestantes < 0) estado = 'expirado';
      else if (diasRestantes <= 3) estado = 'urgente';
      else estado = 'aviso';
      const cliente = v.clientes || {};
      const phone = (cliente.whatsapp || '').replace(/\D/g, '');
      expiracoes.push({
        id: v.id,
        nome: cliente.nome || '—',
        phone,
        plataforma: v.plataforma || '—',
        plano: v.plano || '—',
        diasRestantes,
        estado,
        dataVenda: v.data_venda ? v.data_venda.split('T')[0] : '',
      });
    }
    expiracoes.sort((a, b) => a.diasRestantes - b.diasRestantes);
    res.json({ expiracoes, fonte: 'supabase' });
  } catch (err) {
    console.error('Erro GET /expiracoes-db:', err.message);
    res.status(500).json({ error: 'Erro ao ler expirações do Supabase' });
  }
});

router.post('/expiracoes/avisar', async (req, res) => {
  const item = req.body;
  if (!item.phone) return res.status(400).json({ error: 'phone obrigatório' });
  const nome = item.nome || '';
  const plataforma = item.plataforma || '';
  const dias = item.diasRestantes != null ? item.diasRestantes : -1;
  const website = branding.website;
  let msg;
  if (dias >= 5) {
    msg = `Olá ${nome}! 😊\n\nO teu plano 🎬 *${plataforma}* expira daqui a *7 dias*.\n\nAproveita para renovar com antecedência e continua a ver os teus filmes e séries favoritos sem interrupções 🍿\n\n👉 Renova aqui: ${website}\n\nQualquer dúvida estamos aqui! 💬`;
  } else if (dias >= 1) {
    msg = `${nome}, atenção! ⏰\n\nO teu plano 🎬 *${plataforma}* expira em apenas *${dias} dia(s)*.\n\nNão percas o acesso às tuas séries a meio — renova agora em menos de 2 minutos 😊\n\n💳 Renova aqui: ${website}\n\nEstamos sempre disponíveis para ajudar! 🙌`;
  } else {
    msg = `${nome}, hoje é o último dia! 🚨\n\nO teu plano 🎬 *${plataforma}* expira *hoje*.\n\nRenova agora e continua a ver sem parar 🎬🍿\n\n🔗 ${website}\n\nObrigado por escolheres a ${branding.nome}! ❤️`;
  }
  await sendWhatsAppMessage(item.phone, msg);
  res.json({ success: true });
});

router.post('/expiracoes/verificar-agora', async (req, res) => {
  try {
    await expiracaoModulo.verificarExpiracoes({ sendWhatsAppMessage, MAIN_BOSS, branding, fetchAllRows, markProfileAvailable, isIndisponivel });
    res.json({ success: true, message: 'Verificação concluída — ver logs do servidor para detalhes' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function getPrecoDePlano(plataforma, plano) {
  const pStr = (plataforma || '').toLowerCase();
  const plStr = (plano || '').toLowerCase();
  const p = branding.precos;
  if (pStr.includes('netflix')) {
    if (plStr.includes('familia') || plStr.includes('família')) return p.netflix.familia;
    if (plStr.includes('partilha') || plStr.includes('shared')) return p.netflix.partilha;
    return p.netflix.individual;
  }
  if (pStr.includes('prime')) {
    if (plStr.includes('familia') || plStr.includes('família')) return p.prime.familia;
    if (plStr.includes('partilha') || plStr.includes('shared')) return p.prime.partilha;
    return p.prime.individual;
  }
  return 0;
}

router.get('/clientes', async (req, res) => {
  try {
    const rows = await fetchAllRows();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
    const clientMap = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const plataforma = row[0] || '';
      const nomePerfil = row[3] || '';
      const status = row[5] || '';
      const cliente = row[6] || '';
      const dataVendaStr = row[7] || '';
      const tipoConta = row[9] || '';
      if (!isIndisponivel(status) || !cliente || !dataVendaStr) continue;
      const parts = dataVendaStr.split('/');
      if (parts.length !== 3) continue;
      const dataVenda = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (isNaN(dataVenda.getTime())) continue;
      const expiry = new Date(dataVenda);
      expiry.setDate(expiry.getDate() + 30);
      expiry.setHours(0, 0, 0, 0);
      const diasRestantes = Math.round((expiry - today) / msPerDay);
      let estado;
      if (diasRestantes < 0) estado = 'expirado';
      else if (diasRestantes <= 3) estado = 'urgente';
      else if (diasRestantes <= 7) estado = 'aviso';
      else estado = 'ok';
      const clienteParts = cliente.split(' - ');
      const nome = clienteParts.length > 1 ? clienteParts.slice(0, -1).join(' - ') : cliente;
      const phone = clienteParts.length > 1 ? clienteParts[clienteParts.length - 1] : '';
      const key = phone || nome;
      const planoNome = nomePerfil || tipoConta;
      const valorPago = getPrecoDePlano(plataforma, planoNome);
      if (!clientMap[key]) clientMap[key] = { phone, nome, planos: [] };
      clientMap[key].planos.push({ id: i + 1, plataforma, plano: planoNome, dataVenda: dataVendaStr, diasRestantes, estado, valorPago });
    }
    const estadoRank = { expirado: 0, urgente: 1, aviso: 2, ok: 3 };
    const clientes = Object.values(clientMap).map(c => {
      const worst = c.planos.reduce((w, p) => estadoRank[p.estado] < estadoRank[w.estado] ? p : w, c.planos[0]);
      const totalValor = c.planos.filter(p => p.estado !== 'expirado').reduce((sum, p) => sum + (p.valorPago || 0), 0);
      return { ...c, totalPlanos: c.planos.length, diasRestantes: worst.diasRestantes, estado: worst.estado, totalValor };
    });
    clientes.sort((a, b) => estadoRank[a.estado] - estadoRank[b.estado] || a.diasRestantes - b.diasRestantes);
    const seenPhones = new Set(clientes.map(c => c.phone).filter(Boolean));
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const statusRaw = (row[5] || '').toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!statusRaw.includes('a_verificar')) continue;
      const nome = (row[6] || '').trim();
      const phone = (row[7] || '').toString().replace(/[^0-9]/g, '');
      if (!nome) continue;
      if (seenPhones.has(phone)) continue;
      seenPhones.add(phone);
      clientes.push({ phone, nome, planos: [], totalPlanos: 0, diasRestantes: null, estado: 'a_verificar', totalValor: 0 });
    }
    const mrr = clientes.filter(c => c.estado !== 'expirado' && c.estado !== 'a_verificar').reduce((sum, c) => sum + (c.totalValor || 0), 0);
    res.json({ clientes, mrr });
  } catch (err) {
    console.error('Erro GET /clientes:', err.message);
    res.status(500).json({ error: 'Erro ao ler clientes' });
  }
});

router.get('/clientes-db', async (req, res) => {
  if (!supabase) return res.json({ clientes: [], mrr: 0 });
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const estadoRank = { expirado: 0, urgente: 1, aviso: 2, ok: 3 };
    const [
      { data: todosClientes, error: errC },
      { data: vendasAtivas, error: errV },
    ] = await Promise.all([
      supabase.from('clientes').select('id, nome, whatsapp').order('nome'),
      supabase.from('vendas').select('id, cliente_id, plataforma, plano, quantidade, valor_total, data_venda, data_expiracao').eq('status', 'ativo'),
    ]);
    if (errC) throw new Error(errC.message);
    if (errV) throw new Error(errV.message);
    const vendasPorCliente = {};
    for (const v of (vendasAtivas || [])) {
      if (!vendasPorCliente[v.cliente_id]) vendasPorCliente[v.cliente_id] = [];
      const expiry = v.data_expiracao ? new Date(v.data_expiracao) : null;
      const diasRestantes = expiry !== null ? Math.round((expiry - today) / msPerDay) : null;
      let estado;
      if (diasRestantes === null || diasRestantes === undefined) estado = 'ok';
      else if (diasRestantes < 0) estado = 'expirado';
      else if (diasRestantes <= 3) estado = 'urgente';
      else if (diasRestantes <= 7) estado = 'aviso';
      else estado = 'ok';
      vendasPorCliente[v.cliente_id].push({
        id: v.id,
        plataforma: v.plataforma,
        plano: v.plano,
        dataVenda: v.data_venda ? v.data_venda.split('T')[0] : '',
        diasRestantes: diasRestantes ?? 0,
        estado,
        valorPago: v.valor_total,
      });
    }
    const clientes = [];
    for (const c of (todosClientes || [])) {
      const planos = vendasPorCliente[c.id] || [];
      if (planos.length === 0) {
        clientes.push({ phone: c.whatsapp, nome: c.nome, planos: [], totalPlanos: 0, diasRestantes: null, estado: 'a_verificar', totalValor: 0 });
        continue;
      }
      const worst = planos.reduce((w, p) => (estadoRank[p.estado] ?? 99) < (estadoRank[w.estado] ?? 99) ? p : w, planos[0]);
      const totalValor = planos.filter(p => p.estado !== 'expirado').reduce((s, p) => s + (p.valorPago || 0), 0);
      clientes.push({ phone: c.whatsapp, nome: c.nome, planos, totalPlanos: planos.length, diasRestantes: worst.diasRestantes, estado: worst.estado, totalValor });
    }
    clientes.sort((a, b) => {
      const aV = a.estado === 'a_verificar', bV = b.estado === 'a_verificar';
      if (aV && !bV) return 1;
      if (!aV && bV) return -1;
      if (aV && bV) return 0;
      return (estadoRank[a.estado] ?? 99) - (estadoRank[b.estado] ?? 99) || (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0);
    });
    const mrr = clientes.filter(c => c.estado !== 'expirado' && c.estado !== 'a_verificar').reduce((s, c) => s + (c.totalValor || 0), 0);
    res.json({ clientes, mrr });
  } catch (err) {
    console.error('Erro GET /clientes-db:', err.message);
    res.status(500).json({ error: 'Erro ao ler clientes do Supabase' });
  }
});

router.post('/clientes/mensagem', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone e message obrigatórios' });
  const result = await sendWhatsAppMessage(phone, message);
  if (!result.sent) return res.status(500).json({ error: 'Falha ao enviar mensagem' });
  res.json({ success: true });
});

router.get('/financeiro', async (req, res) => {
  try {
    const rows = await fetchAllRows();
    const precos = { 'Netflix': branding.precos.netflix.individual, 'Prime Video': branding.precos.prime.individual };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
    const fin = {
      hoje: { vendas: 0, receita: 0 },
      esteMes: { vendas: 0, receita: 0 },
      mesPassado: { vendas: 0, receita: 0 },
      totalAtivo: { clientes: 0, receita: 0 },
      porPlataforma: { 'Netflix': { vendas: 0, receita: 0 }, 'Prime Video': { vendas: 0, receita: 0 } },
      ultimos7Dias: [],
    };
    const dias7 = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      dias7[key] = { data: key, receita: 0, vendas: 0 };
    }
    const clientesSet = new Set();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!isIndisponivel(row[5])) continue;
      const plataforma = (row[0] || '').trim();
      const cliente = row[6] || '';
      const dataVendaStr = row[7] || '';
      const quantidade = parseInt(row[8]) || 1;
      if (!dataVendaStr || !cliente) continue;
      const parts = dataVendaStr.split('/');
      if (parts.length !== 3) continue;
      const dataVenda = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (isNaN(dataVenda.getTime())) continue;
      dataVenda.setHours(0, 0, 0, 0);
      const preco = (precos[plataforma] || 0) * quantidade;
      clientesSet.add(cliente);
      fin.totalAtivo.receita += preco;
      if (fin.porPlataforma[plataforma]) {
        fin.porPlataforma[plataforma].vendas += quantidade;
        fin.porPlataforma[plataforma].receita += preco;
      }
      if (dataVenda.getTime() === today.getTime()) {
        fin.hoje.vendas += quantidade;
        fin.hoje.receita += preco;
      }
      if (dataVenda.getMonth() === thisMonth && dataVenda.getFullYear() === thisYear) {
        fin.esteMes.vendas += quantidade;
        fin.esteMes.receita += preco;
      }
      if (dataVenda.getMonth() === lastMonth && dataVenda.getFullYear() === lastMonthYear) {
        fin.mesPassado.vendas += quantidade;
        fin.mesPassado.receita += preco;
      }
      const dayKey = `${String(dataVenda.getDate()).padStart(2, '0')}/${String(dataVenda.getMonth() + 1).padStart(2, '0')}`;
      if (dias7[dayKey]) {
        dias7[dayKey].receita += preco;
        dias7[dayKey].vendas += quantidade;
      }
    }
    fin.totalAtivo.clientes = clientesSet.size;
    fin.ultimos7Dias = Object.values(dias7);
    res.json({ success: true, financeiro: fin });
  } catch (err) {
    console.error('Erro GET /financeiro:', err.message);
    res.status(500).json({ error: 'Erro ao calcular financeiro' });
  }
});

router.get('/chat/:phone', (req, res) => {
  const phone = (req.params.phone || '').replace(/\D/g, '');
  if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
  const state = clientStates[phone] || null;
  if (!state) return res.status(404).json({ error: 'Sem sessão activa para este número.' });
  const history = (chatHistories[phone] || []).map(m => ({ role: m.role, text: m.parts?.[0]?.text || '' }));
  res.json({
    phone,
    step: state.step || '—',
    clientName: state.clientName || '',
    isPaused: !!pausedClients[phone],
    cart: state.cart || [],
    totalValor: state.totalValor || 0,
    history,
    pending: pendingVerifications[phone] || null,
  });
});

router.get('/active-sessions', (req, res) => {
  const sessions = Object.entries(clientStates).map(([phone, state]) => ({
    phone,
    step: state.step,
    clientName: state.clientName || '',
    lastActivity: state.lastActivity || null,
    isPaused: !!pausedClients[phone],
    hasPending: !!pendingVerifications[phone],
  }));
  sessions.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  res.json({ total: sessions.length, sessions });
});

router.post('/session/pausar', (req, res) => {
  const phone = (req.body.phone || '').replace(/\D/g, '');
  if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
  pausedClients[phone] = true;
  console.log(`[Admin API] Bot pausado para ${phone}`);
  res.json({ success: true, phone, isPaused: true });
});

router.post('/session/retomar', (req, res) => {
  const phone = (req.body.phone || '').replace(/\D/g, '');
  if (!phone) return res.status(400).json({ error: 'phone obrigatório' });
  delete pausedClients[phone];
  console.log(`[Admin API] Bot retomado para ${phone}`);
  res.json({ success: true, phone, isPaused: false });
});

router.post('/broadcast', async (req, res) => {
  const { numbers, message, delay_ms } = req.body;
  if (!numbers || !Array.isArray(numbers) || numbers.length === 0) return res.status(400).json({ error: 'Lista de números obrigatória.' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Mensagem obrigatória.' });
  const delayBetween = parseInt(delay_ms, 10) || 2500;
  const MAX_NUMBERS = 500;
  const batch = numbers.slice(0, MAX_NUMBERS);
  let sent = 0, failed = 0;
  const results = [];
  for (const num of batch) {
    const clean = (num || '').toString().replace(/\D/g, '');
    if (!clean || clean.length < 9 || clean.length > 15) {
      failed++;
      results.push({ num: clean || num, status: 'invalid' });
      continue;
    }
    const result = await sendWhatsAppMessage(clean, message);
    if (result.sent) { sent++; results.push({ num: clean, status: 'sent' }); }
    else { failed++; results.push({ num: clean, status: result.invalidNumber ? 'no_whatsapp' : 'failed' }); }
    if (delayBetween > 0) await new Promise(r => setTimeout(r, delayBetween));
  }
  console.log(`📢 BROADCAST: ${sent} enviadas, ${failed} falharam (de ${batch.length})`);
  res.json({ success: true, sent, failed, total: batch.length, results });
});

router.post('/broadcast/expiracoes', async (req, res) => {
  const diasAte = parseInt(req.body.dias_ate, 10) || 7;
  const delayMs = parseInt(req.body.delay_ms, 10) || 3000;
  const mensagemCustom = (req.body.mensagem_custom || '').trim();

  if (supabase) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const msPerDay = 24 * 60 * 60 * 1000;
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() + diasAte + 1);
      const { data: vendas, error } = await supabase
        .from('vendas')
        .select('plataforma, data_expiracao, clientes(nome, whatsapp)')
        .eq('status', 'ativo')
        .lte('data_expiracao', cutoff.toISOString());
      if (error) throw new Error(error.message);
      const targets = [];
      for (const v of (vendas || [])) {
        if (!v.data_expiracao) continue;
        const expiry = new Date(v.data_expiracao);
        expiry.setHours(0, 0, 0, 0);
        const diasRestantes = Math.round((expiry - today) / msPerDay);
        if (diasRestantes > diasAte) continue;
        const phone = ((v.clientes || {}).whatsapp || '').replace(/\D/g, '');
        if (!phone || phone.length < 9) continue;
        let estado;
        if (diasRestantes < 0) estado = 'expirado';
        else if (diasRestantes <= 3) estado = 'urgente';
        else estado = 'aviso';
        targets.push({ phone, nome: (v.clientes || {}).nome || '', plataforma: v.plataforma || '', diasRestantes, estado });
      }
      if (targets.length === 0) return res.json({ success: true, sent: 0, failed: 0, total: 0, message: `Nenhum cliente com expiração em ≤ ${diasAte} dias.`, fonte: 'supabase' });
      let sent = 0, failed = 0;
      const results = [];
      for (const t of targets) {
        const msg = mensagemCustom
          ? mensagemCustom.replace('{nome}', t.nome).replace('{plataforma}', t.plataforma).replace('{dias}', String(t.diasRestantes))
          : t.diasRestantes >= 5
            ? `Olá ${t.nome}! 😊\n\nO teu plano 🎬 *${t.plataforma}* expira daqui a *7 dias*.\n\nAproveita para renovar com antecedência e continua a ver os teus filmes e séries favoritos sem interrupções 🍿\n\n👉 Renova aqui: ${branding.website}\n\nQualquer dúvida estamos aqui! 💬`
            : t.diasRestantes >= 1
              ? `${t.nome}, atenção! ⏰\n\nO teu plano 🎬 *${t.plataforma}* expira em apenas *${t.diasRestantes} dia(s)*.\n\nNão percas o acesso às tuas séries a meio — renova agora em menos de 2 minutos 😊\n\n💳 Renova aqui: ${branding.website}\n\nEstamos sempre disponíveis para ajudar! 🙌`
              : `${t.nome}, hoje é o último dia! 🚨\n\nO teu plano 🎬 *${t.plataforma}* expira *hoje*.\n\nRenova agora e continua a ver sem parar 🎬🍿\n\n🔗 ${branding.website}\n\nObrigado por escolheres a ${branding.nome}! ❤️`;
        const result = await sendWhatsAppMessage(t.phone, msg);
        if (result.sent) { sent++; results.push({ ...t, status: 'sent' }); }
        else { failed++; results.push({ ...t, status: 'failed' }); }
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      }
      console.log(`📢 BROADCAST EXPIRACOES (Supabase): ${sent} enviadas, ${failed} falharam (filtro: ≤${diasAte} dias)`);
      return res.json({ success: true, sent, failed, total: targets.length, results, fonte: 'supabase' });
    } catch (err) {
      console.error('Erro broadcast/expiracoes (Supabase):', err.message, '— a tentar fallback Sheet');
    }
  }

  try {
    const rows = await fetchAllRows();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const targets = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const plataforma = row[0] || '';
      const status = row[5] || '';
      const cliente = row[6] || '';
      const phone = (row[7] || '').toString().replace(/\D/g, '');
      const dataVendaStr = row[8] || '';
      if (!isIndisponivel(status) || !cliente || !dataVendaStr) continue;
      const parts = dataVendaStr.split('/');
      if (parts.length !== 3) continue;
      const dataVenda = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      if (isNaN(dataVenda.getTime())) continue;
      const expiry = new Date(dataVenda);
      expiry.setDate(expiry.getDate() + 30);
      expiry.setHours(0, 0, 0, 0);
      const diasRestantes = Math.round((expiry - today) / msPerDay);
      if (diasRestantes > diasAte) continue;
      const nome = cliente;
      if (!phone || phone.length < 9) continue;
      let estado;
      if (diasRestantes < 0) estado = 'expirado';
      else if (diasRestantes <= 3) estado = 'urgente';
      else estado = 'aviso';
      targets.push({ phone, nome, plataforma, diasRestantes, estado });
    }
    if (targets.length === 0) return res.json({ success: true, sent: 0, failed: 0, total: 0, message: `Nenhum cliente com expiração em ≤${diasAte} dias.` });
    let sent = 0, failed = 0;
    const results = [];
    for (const t of targets) {
      let msg;
      if (mensagemCustom) {
        msg = mensagemCustom.replace('{nome}', t.nome).replace('{plataforma}', t.plataforma).replace('{dias}', String(t.diasRestantes));
      } else if (t.diasRestantes >= 5) {
        msg = `Olá ${t.nome}! 😊\n\nO teu plano 🎬 *${t.plataforma}* expira daqui a *7 dias*.\n\nAproveita para renovar com antecedência e continua a ver os teus filmes e séries favoritos sem interrupções 🍿\n\n👉 Renova aqui: ${branding.website}\n\nQualquer dúvida estamos aqui! 💬`;
      } else if (t.diasRestantes >= 1) {
        msg = `${t.nome}, atenção! ⏰\n\nO teu plano 🎬 *${t.plataforma}* expira em apenas *${t.diasRestantes} dia(s)*.\n\nNão percas o acesso às tuas séries a meio — renova agora em menos de 2 minutos 😊\n\n💳 Renova aqui: ${branding.website}\n\nEstamos sempre disponíveis para ajudar! 🙌`;
      } else {
        msg = `${t.nome}, hoje é o último dia! 🚨\n\nO teu plano 🎬 *${t.plataforma}* expira *hoje*.\n\nRenova agora e continua a ver sem parar 🎬🍿\n\n🔗 ${branding.website}\n\nObrigado por escolheres a ${branding.nome}! ❤️`;
      }
      const result = await sendWhatsAppMessage(t.phone, msg);
      if (result.sent) { sent++; results.push({ ...t, status: 'sent' }); }
      else { failed++; results.push({ ...t, status: 'failed' }); }
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    }
    console.log(`📢 BROADCAST EXPIRACOES: ${sent} enviadas, ${failed} falharam (filtro: ≤${diasAte} dias)`);
    res.json({ success: true, sent, failed, total: targets.length, results });
  } catch (err) {
    console.error('Erro broadcast/expiracoes:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/financeiro-db', async (req, res) => {
  if (!supabase) return res.json({ success: false, message: 'Supabase não configurado' });
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [
      { data: todasVendas },
      { data: vendasHoje },
      { data: vendasMes },
      { data: vendasMesPassado },
      { data: vendasSemana },
      { data: clientesAtivos },
    ] = await Promise.all([
      supabase.from('vendas').select('valor_total, plataforma, quantidade').eq('status', 'ativo'),
      supabase.from('vendas').select('valor_total, quantidade').gte('data_venda', today.toISOString()).lt('data_venda', tomorrow.toISOString()),
      supabase.from('vendas').select('valor_total, quantidade').gte('data_venda', thisMonthStart).eq('status', 'ativo'),
      supabase.from('vendas').select('valor_total, quantidade').gte('data_venda', lastMonthStart).lt('data_venda', lastMonthEnd).eq('status', 'ativo'),
      supabase.from('vendas').select('valor_total, quantidade, data_venda, plataforma').gte('data_venda', sevenDaysAgo).eq('status', 'ativo'),
      supabase.from('vendas').select('cliente_id').eq('status', 'ativo'),
    ]);
    const sum = (arr) => (arr || []).reduce((s, r) => s + (r.valor_total || 0), 0);
    const cnt = (arr) => (arr || []).reduce((s, r) => s + (r.quantidade || 1), 0);
    const dias7 = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      dias7[key] = { data: key, receita: 0, vendas: 0 };
    }
    (vendasSemana || []).forEach(v => {
      const d = new Date(v.data_venda);
      const key = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (dias7[key]) {
        dias7[key].receita += v.valor_total || 0;
        dias7[key].vendas += v.quantidade || 1;
      }
    });
    const porPlataforma = {};
    (todasVendas || []).forEach(v => {
      const p = v.plataforma || 'Outro';
      if (!porPlataforma[p]) porPlataforma[p] = { vendas: 0, receita: 0 };
      porPlataforma[p].vendas += v.quantidade || 1;
      porPlataforma[p].receita += v.valor_total || 0;
    });
    res.json({
      success: true,
      fonte: 'supabase',
      financeiro: {
        hoje: { vendas: cnt(vendasHoje), receita: sum(vendasHoje) },
        esteMes: { vendas: cnt(vendasMes), receita: sum(vendasMes) },
        mesPassado: { vendas: cnt(vendasMesPassado), receita: sum(vendasMesPassado) },
        totalAtivo: { clientes: new Set((clientesAtivos || []).map(r => r.cliente_id)).size, receita: sum(todasVendas) },
        porPlataforma,
        ultimos7Dias: Object.values(dias7),
      },
    });
  } catch (err) {
    console.error('Erro GET /financeiro-db:', err.message);
    res.status(500).json({ error: 'Erro ao calcular financeiro via Supabase' });
  }
});

module.exports = router;
