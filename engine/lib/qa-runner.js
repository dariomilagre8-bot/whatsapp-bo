// engine/lib/qa-runner.js — QA-as-a-Judge: lógica core de checks e scoring
// CommonJS | Node.js 20 | sem dependências externas

const path = require('path');
const { detectIntent } = require('../../src/engine/intentDetector');

const FALLBACK_MSG = 'Desculpe, estou a atualizar o meu sistema no momento. Pode aguardar um minuto e tentar de novo?';

// Mapeamento de labels dos cenários → valores INTENT_ do detector
const INTENT_MAP = {
  saudacao:     'INTENT_SAUDACAO',
  catalogo:     'INTENT_VENDA',
  stock:        'INTENT_VENDA',
  suporte_conta:'INTENT_SUPORTE_CONTA',
  despedida:    'INTENT_DESCONHECIDO',
  preco:        'INTENT_VENDA',
  encomenda:    'INTENT_VENDA',
  pagamento:    'INTENT_SUPORTE_PAGAMENTO',
  fora_contexto:'INTENT_DESCONHECIDO',
  escalar:      'INTENT_SUPORTE_CONTA',
};

// Mapeamento slug → ficheiro de cenário
const NICHO_MAP = {
  streamzone: 'streaming',
  demo:       'ecommerce',
  'demo-moda':'ecommerce',
  luna:       'generico',
};

const DANGEROUS_PATTERNS = [
  { name: 'link_externo',   rx: /https?:\/\//i },
  { name: 'promessa_falsa', rx: /garantimos\s+\d+%|dinheiro de volta garantido|resultados garantidos em/i },
  { name: 'dado_pessoal',   rx: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\bpassword\s*[:=]\s*\S+/i },
];

const SCENARIOS_DIR = path.join(__dirname, '..', 'templates', 'qa-scenarios');

function loadScenario(clientConfig) {
  const slug = clientConfig.slug || clientConfig.clientSlug || '';
  const nicho = clientConfig.niche || clientConfig.nicho || NICHO_MAP[slug] || 'generico';
  const file = path.join(SCENARIOS_DIR, `${nicho}.json`);
  try {
    return { nicho, scenarios: require(file) };
  } catch (_) {
    return { nicho: 'generico', scenarios: require(path.join(SCENARIOS_DIR, 'generico.json')) };
  }
}

function checkResponse(msg, response, expectedLabel, clientConfig, elapsed) {
  const { intent: detectedIntent } = detectIntent({ text: msg, clientSlug: clientConfig.slug });
  const expectedIntent = INTENT_MAP[expectedLabel] || null;

  const dangerous = DANGEROUS_PATTERNS.find(p => p.rx.test(response));
  const hasEmoji = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(response);

  return {
    timeout:       elapsed < 10000,
    safe:          !dangerous,
    safeDetail:    dangerous ? dangerous.name : null,
    intent:        !expectedIntent || detectedIntent === expectedIntent,
    detectedIntent,
    emoji:         !clientConfig.noEmoji || !hasEmoji,
    valid:         response.trim().length > 0 && response !== FALLBACK_MSG,
  };
}

function calculateScore(results) {
  if (!results.length) return 0;
  const CHECKS = ['timeout', 'safe', 'intent', 'emoji', 'valid'];
  let passed = 0;
  for (const { checks } of results) {
    for (const k of CHECKS) { if (checks[k]) passed++; }
  }
  return Math.round((passed / (results.length * CHECKS.length)) * 100);
}

module.exports = { loadScenario, checkResponse, calculateScore, INTENT_MAP, SCENARIOS_DIR };
