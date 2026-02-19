<<<<<<< Updated upstream
// Módulo de expiração: liberta perfis cuja data de venda já passou do período de validade (ex.: 30 dias)
const { fetchAllRows, todayDate, markProfileAvailable } = require('./googleSheets');

const DIAS_VALIDADE = parseInt(process.env.DIAS_VALIDADE_EXPIRACAO, 10) || 30;

function parseDateDDMMYYYY(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split(/[/\-.]/);
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  const d = new Date(year, month, day);
  if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) return null;
  return d;
}

function isExpired(dataVendaStr) {
  const dataVenda = parseDateDDMMYYYY(dataVendaStr);
  if (!dataVenda) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fimValidade = new Date(dataVenda);
  fimValidade.setDate(fimValidade.getDate() + DIAS_VALIDADE);
  fimValidade.setHours(0, 0, 0, 0);
  return hoje >= fimValidade;
}

async function checkExpiration() {
  try {
    const rows = await fetchAllRows();
    if (!rows || rows.length <= 1) return;
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const status = (row[5] || '').toString().toLowerCase();
      const dataVenda = (row[7] || '').toString().trim();
      const isIndisponivel = status.includes('indispon');
      if (isIndisponivel && dataVenda && isExpired(dataVenda)) {
        await markProfileAvailable(i + 1);
        count++;
      }
    }
    if (count > 0) console.log(`[Expiracao] ${count} perfil(is) libertado(s) por expiração.`);
  } catch (e) {
    console.error('[Expiracao] Erro:', e.message);
  }
}

function startExpirationInterval() {
  const intervalMs = (parseInt(process.env.EXPIRACAO_INTERVAL_MINUTES, 10) || 60) * 60 * 1000;
  checkExpiration();
  setInterval(checkExpiration, intervalMs);
}

module.exports = { checkExpiration, startExpirationInterval };
=======
// =====================================================================
// MÓDULO: NOTIFICAÇÕES DE EXPIRAÇÃO
// =====================================================================
// COMO REUTILIZAR ESTE TEMPLATE:
//
// Este módulo segue um padrão de 4 partes que podes aplicar a
// qualquer feature de automação futura:
//
//   1. CONFIGURAÇÃO  — variáveis e constantes do módulo
//   2. LÓGICA CORE   — a função principal que faz o trabalho
//   3. SCHEDULER     — quando executa (cron/interval)
//   4. ENDPOINT API  — expõe dados ao dashboard
//
// Para criar uma nova feature, copia este ficheiro, muda as 4 partes.
// =====================================================================

// ─────────────────────────────────────────────────────────────────────
// PARTE 1 — CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────────────

const EXPIRACAO_CONFIG = {
  diasPlano: 30,          // duração do plano em dias
  avisoDias: 3,           // avisar X dias antes de expirar
  horaExecucao: 9,        // hora do dia para correr (9 = 9h da manhã)
  checkIntervalMs: 60 * 60 * 1000, // verificar a cada 1 hora
};

// Tracking para não enviar avisos duplicados no mesmo dia
const expiracaoAvisosEnviados = new Set(); // "phone_YYYY-MM-DD"

// ─────────────────────────────────────────────────────────────────────
// PARTE 2 — LÓGICA CORE
// ─────────────────────────────────────────────────────────────────────

// Converte "DD/MM/YYYY" → objeto Date
function parseDatePT(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const [dia, mes, ano] = parts;
  const d = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
  return isNaN(d.getTime()) ? null : d;
}

// Diferença em dias entre hoje e uma data
function diasAteExpirar(dataVenda) {
  const venda = parseDatePT(dataVenda);
  if (!venda) return null;
  const expiracao = new Date(venda);
  expiracao.setDate(expiracao.getDate() + EXPIRACAO_CONFIG.diasPlano);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  expiracao.setHours(0, 0, 0, 0);
  const diffMs = expiracao - hoje;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Mensagem de aviso — 3 dias antes
function msgAviso(nome, plataforma, plano, diasRestantes) {
  const nomeStr = nome ? `Olá ${nome}! 👋` : 'Olá! 👋';
  const emoji = plataforma.toLowerCase().includes('netflix') ? '🎬' : '📺';
  return `${nomeStr}\n\n${emoji} O teu plano *${plataforma} ${plano}* expira em *${diasRestantes} dias*.\n\nPara continuares a ver sem interrupções, renova agora! 😊\n\nResponde *renovar* ou clica aqui:\nhttps://streamzone-frontend.vercel.app`;
}

// Mensagem de último dia
function msgUltimoDia(nome, plataforma, plano) {
  const nomeStr = nome ? `${nome}, ` : '';
  const emoji = plataforma.toLowerCase().includes('netflix') ? '🎬' : '📺';
  return `⚠️ ${nomeStr}hoje é o *último dia* do teu plano ${emoji} *${plataforma} ${plano}*!\n\nNão percas o acesso — renova agora em segundos:\nhttps://streamzone-frontend.vercel.app\n\nQualquer dúvida estamos aqui. 😊`;
}

// Mensagem de expirado (enviada ao supervisor)
function msgSupervisorExpirado(phone, nome, plataforma, plano, rowIndex) {
  return `🔄 *PLANO EXPIRADO*\n👤 ${nome || phone}\n📱 ${phone}\n${plataforma.toLowerCase().includes('netflix') ? '🎬' : '📺'} ${plataforma} ${plano}\n📋 Linha ${rowIndex} libertada na Sheet\n\nCliente não renovou — slot reposto.`;
}

// ─────────────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL — corre uma vez por dia
// ─────────────────────────────────────────────────────────────────────
async function verificarExpiracoes() {
  console.log('🔔 [Expiração] A verificar planos...');
  const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD para dedup
  let avisados = 0, expirados = 0;

  try {
    const rows = await fetchAllRows();
    if (!rows || rows.length <= 1) return;

    // Colunas: A=Plataforma B=Email C=Senha D=NomePerfil E=Pin F=Status G=Cliente H=Data_Venda I=QNTD J=Tipo
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const plataforma = row[0] || '';
      const status     = row[5] || '';
      const clienteRaw = row[6] || '';
      const dataVenda  = row[7] || '';
      const plano      = row[8] || 'Individual';

      // Só processa linhas vendidas (indisponíveis) com data de venda
      if (!isIndisponivel(status) || !dataVenda || !clienteRaw) continue;

      // Extrair número e nome do campo Cliente ("Nome - 244XXXXXXXXX")
      const partes = clienteRaw.split(' - ');
      const nome   = partes[0]?.trim() || '';
      const phone  = partes[1]?.replace(/\D/g, '') || partes[0]?.replace(/\D/g, '') || '';
      if (!phone) continue;

      const dias = diasAteExpirar(dataVenda);
      if (dias === null) continue;

      const dedupeKey = `${phone}_${hoje}`;

      // ── CASO 1: Expira em exactamente DIAS_AVISO dias ──
      if (dias === EXPIRACAO_CONFIG.avisoDias && !expiracaoAvisosEnviados.has(dedupeKey)) {
        await sendWhatsAppMessage(phone, msgAviso(nome, plataforma, plano, dias));
        expiracaoAvisosEnviados.add(dedupeKey);
        avisados++;
        console.log(`📩 [Expiração] Aviso enviado: ${phone} (${nome}) — ${plataforma} expira em ${dias} dias`);
      }

      // ── CASO 2: Último dia ──
      else if (dias === 1 && !expiracaoAvisosEnviados.has(dedupeKey + '_ultimo')) {
        await sendWhatsAppMessage(phone, msgUltimoDia(nome, plataforma, plano));
        expiracaoAvisosEnviados.add(dedupeKey + '_ultimo');
        avisados++;
        console.log(`⚠️ [Expiração] Último dia: ${phone} (${nome}) — ${plataforma}`);
      }

      // ── CASO 3: Já expirou — libertar slot ──
      else if (dias < 0) {
        const rowIndex = i + 1;
        await markProfileAvailable(rowIndex);
        expirados++;
        console.log(`♻️ [Expiração] Slot libertado: linha ${rowIndex} — ${phone} (${plataforma})`);

        // Notificar supervisor
        if (MAIN_BOSS) {
          await sendWhatsAppMessage(MAIN_BOSS, msgSupervisorExpirado(phone, nome, plataforma, plano, rowIndex));
        }
      }
    }

    console.log(`✅ [Expiração] Concluído — ${avisados} avisos enviados, ${expirados} slots libertados`);
  } catch (err) {
    console.error('❌ [Expiração] Erro:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────
// PARTE 3 — SCHEDULER
// Executa às 9h todos os dias
// ─────────────────────────────────────────────────────────────────────
function iniciarSchedulerExpiracao() {
  function msAteProximas9h() {
    const agora = new Date();
    const proximas9h = new Date();
    proximas9h.setHours(EXPIRACAO_CONFIG.horaExecucao, 0, 0, 0);
    if (proximas9h <= agora) proximas9h.setDate(proximas9h.getDate() + 1);
    return proximas9h - agora;
  }

  // Primeiro run — às 9h de hoje (ou amanhã se já passou)
  setTimeout(() => {
    verificarExpiracoes();
    // Depois disso, corre a cada 24h
    setInterval(verificarExpiracoes, 24 * 60 * 60 * 1000);
  }, msAteProximas9h());

  const horasAte = Math.round(msAteProximas9h() / 1000 / 60 / 60);
  console.log(`🕘 [Expiração] Scheduler iniciado — próxima verificação em ${horasAte}h`);
}

// Arrancar o scheduler quando o bot iniciar
iniciarSchedulerExpiracao();

// ─────────────────────────────────────────────────────────────────────
// PARTE 4 — ENDPOINT API (para o Dashboard)
// ─────────────────────────────────────────────────────────────────────

// GET /api/admin/expiracoes — clientes que expiram nos próximos 7 dias
app.get('/api/admin/expiracoes', requireAdmin, async (req, res) => {
  try {
    const rows = await fetchAllRows();
    const aExpirar = [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const plataforma = row[0] || '';
      const status     = row[5] || '';
      const clienteRaw = row[6] || '';
      const dataVenda  = row[7] || '';
      const plano      = row[8] || '';

      if (!isIndisponivel(status) || !dataVenda || !clienteRaw) continue;

      const dias = diasAteExpirar(dataVenda);
      if (dias === null || dias > 7 || dias < -7) continue;

      const partes = clienteRaw.split(' - ');
      const nome   = partes[0]?.trim() || '';
      const phone  = partes[1]?.replace(/\D/g, '') || '';

      aExpirar.push({
        rowIndex: i + 1,
        plataforma,
        plano,
        nome,
        phone,
        dataVenda,
        diasRestantes: dias,
        estado: dias < 0 ? 'expirado' : dias === 0 ? 'hoje' : dias <= 3 ? 'urgente' : 'aviso',
      });
    }

    // Ordenar por dias restantes (mais urgente primeiro)
    aExpirar.sort((a, b) => a.diasRestantes - b.diasRestantes);

    res.json({ success: true, expiracoes: aExpirar, total: aExpirar.length });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/admin/expiracoes/avisar — enviar aviso manual a um cliente
app.post('/api/admin/expiracoes/avisar', requireAdmin, async (req, res) => {
  try {
    const { phone, nome, plataforma, plano, diasRestantes } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'phone obrigatório' });

    const msg = diasRestantes <= 1
      ? msgUltimoDia(nome, plataforma, plano)
      : msgAviso(nome, plataforma, plano, diasRestantes);

    await sendWhatsAppMessage(phone, msg);
    res.json({ success: true, message: `Aviso enviado para ${phone}` });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});
>>>>>>> Stashed changes
