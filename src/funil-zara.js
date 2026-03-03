/**
 * [CPA] Funil Zara v2 — steps, nome, fecho consolidado, tabela de preços com stock.
 * CommonJS.
 */
const { fetchAllRows } = require('../googleSheets');

// Status "disponivel" na coluna F (índice 5)
function normalizeStatus(s) {
  return (s || '').toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function isDisponivel(statusCell) {
  const n = normalizeStatus(statusCell);
  return n.includes('dispon') && !n.includes('indispon');
}
function normalizePlataforma(raw) {
  const s = (raw || '').toLowerCase().trim();
  if (s.includes('netflix')) return 'netflix';
  if (s.includes('prime')) return 'prime';
  return s;
}

const STEPS = {
  INICIO: 'inicio',
  MENU: 'menu',
  ESCOLHA_PLATAFORMA: 'escolha_plataforma',
  ESCOLHA_PLANO: 'escolha_plano',
  FECHO: 'fecho',
  AGUARDANDO_COMPROVATIVO: 'aguardando_comprovativo',
  PAUSADO: 'pausado',
};

/**
 * Extrai nome do pushName. NUNCA pedir nome ao cliente — usar pushName ou fallback.
 */
function extrairNome(pushName) {
  if (!pushName || typeof pushName !== 'string' || pushName.length < 2) {
    return 'Estimado(a) Cliente';
  }
  let nome = pushName.replace(/[^\p{L}\s]/gu, '').trim();
  nome = nome.split(/\s+/)[0];
  if (!nome || nome.length < 2) return 'Estimado(a) Cliente';
  return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
}

/**
 * Conta perfis disponíveis por plataforma na Google Sheet.
 * Colunas: A=Plataforma, F=Status (disponivel = em stock).
 */
async function verificarStock(plataforma) {
  try {
    const rows = await fetchAllRows();
    if (!rows || rows.length <= 1) return 0;
    let count = 0;
    const platNorm = normalizePlataforma(plataforma);
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowPlat = normalizePlataforma(row[0] || '');
      const status = row[5];
      if (rowPlat.includes(platNorm) && isDisponivel(status)) count++;
    }
    return count;
  } catch (e) {
    console.error('[funil-zara] verificarStock:', e.message);
    return 0;
  }
}

/**
 * Gera tabela de preços conforme stock. Esgota = mensagem de esgotado.
 */
async function gerarTabelaPrecos() {
  const stockNetflix = await verificarStock('Netflix');
  const stockPrime = await verificarStock('Prime Video');

  let msg = '';

  if (stockNetflix > 0) {
    msg += '🎬 *Netflix:*\n';
    msg += '• Individual — 5.000 Kz (1 dispositivo)\n';
    msg += '• Partilhado — 9.000 Kz (2 dispositivos)\n';
    msg += '• Família — 13.500 Kz (3 dispositivos)\n\n';
  } else {
    msg += '🎬 Netflix — Esgotado de momento ❌\n\n';
  }

  if (stockPrime > 0) {
    msg += '📺 *Prime Video:*\n';
    msg += '• Individual — 3.000 Kz (1 dispositivo)\n';
    msg += '• Partilhado — 5.500 Kz (2 dispositivos)\n';
    msg += '• Família — 8.000 Kz (3 dispositivos)\n\n';
  } else {
    msg += '📺 Prime Video — Esgotado de momento ❌\n\n';
  }

  if (stockNetflix === 0 && stockPrime === 0) {
    msg = 'De momento não temos planos disponíveis. Posso notificá-lo(a) quando voltarem ao stock! 📢';
  } else {
    msg += 'Qual lhe interessa? 😊';
  }

  return msg;
}

/** Preços por plano (Kz) — imutáveis */
const PRECOS = {
  netflix: { individual: 5000, partilhado: 9000, familia: 13500 },
  prime: { individual: 3000, partilhado: 5500, familia: 8000 },
};

const IBAN = '0040.0000.7685.3192.1018.3';
const MULTICAIXA = '946014060';
const TITULAR = 'Braulio Manuel';

/**
 * Uma ÚNICA mensagem de fecho consolidada (nunca separar em várias).
 * @param {{ plataforma: string, plano: string, valor: number, dispositivos: number }} opts
 */
function mensagemFechoConsolidada(opts) {
  const { plataforma, plano, valor, dispositivos = 1 } = opts;
  const planoLabel = plano.charAt(0).toUpperCase() + plano.slice(1).toLowerCase();
  return (
    `📦 *${plataforma} - Plano ${planoLabel}*\n` +
    `💰 Valor: *${valor.toLocaleString('pt')} Kz/mês*\n` +
    `📱 Dispositivos: ${dispositivos} em simultâneo\n\n` +
    `🏦 *Dados para pagamento:*\n` +
    `• IBAN: ${IBAN}\n` +
    `• Multicaixa Express: ${MULTICAIXA}\n` +
    `• Titular: ${TITULAR}\n\n` +
    `Após o pagamento, envie o comprovativo (foto ou PDF) por aqui e entregamos o seu acesso! ✅`
  );
}

/**
 * Cross-sell quando stock da plataforma pedida = 0.
 */
async function mensagemCrossSellEsgotado(plataformaPedida) {
  const alternativa = plataformaPedida.toLowerCase().includes('netflix') ? 'Prime Video' : 'Netflix';
  const stockAlternativa = await verificarStock(alternativa);
  const precoMin = alternativa === 'Prime Video' ? '3.000' : '5.000';

  if (stockAlternativa > 0) {
    return `De momento ${plataformaPedida} está temporariamente esgotado. 😔\n\nMas temos *${alternativa}* disponível a partir de ${precoMin} Kz/mês! Gostaria de conhecer os planos?`;
  }
  return 'De momento ambas as plataformas estão esgotadas. Posso notificá-lo(a) assim que voltarem ao stock! 📢';
}

module.exports = {
  STEPS,
  extrairNome,
  verificarStock,
  gerarTabelaPrecos,
  mensagemFechoConsolidada,
  mensagemCrossSellEsgotado,
  PRECOS,
  IBAN,
  MULTICAIXA,
  TITULAR,
};
