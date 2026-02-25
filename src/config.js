// Todas as variáveis de ambiente e constantes derivadas (sem I/O async)
require('dotenv').config();
const branding = require('../branding');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const port = process.env.PORT || 80;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const RAW_SUPERVISORS = (process.env.SUPERVISOR_NUMBER || '').split(',').map(n => n.trim().replace(/\D/g, ''));
const REAL_PHONES = RAW_SUPERVISORS.filter(n => n.length < 15);
const ALL_SUPERVISORS = RAW_SUPERVISORS;
const MAIN_BOSS = REAL_PHONES.length > 0 ? REAL_PHONES[0] : null;

const CATALOGO = {
  netflix: {
    nome: 'Netflix',
    emoji: '🎬',
    planos: {
      individual: branding.precos.netflix.individual,
      partilha: branding.precos.netflix.partilha,
      familia: branding.precos.netflix.familia,
      familia_completa: branding.precos.netflix.familia_completa,
    }
  },
  prime_video: {
    nome: 'Prime Video',
    emoji: '📺',
    planos: {
      individual: branding.precos.prime.individual,
      partilha: branding.precos.prime.partilha,
      familia: branding.precos.prime.familia,
    }
  }
};

const PLAN_SLOTS = { individual: 1, partilha: 2, familia: 3, familia_completa: 5 };
const PLAN_RANK = { individual: 1, partilha: 2, familia: 3, familia_completa: 4 };

const PAYMENT = {
  titular: 'Braulio Manuel',
  iban: '0040.0000.7685.3192.1018.3',
  multicaixa: '946014060'
};

const PLAN_PROFILE_TYPE = { individual: 'full_account', partilha: 'shared_profile', familia: 'shared_profile', familia_completa: 'full_account' };

const SUPPORT_KEYWORDS = [
  'não entra', 'nao entra', 'senha errada', 'ajuda', 'travou',
  'não funciona', 'nao funciona', 'problema', 'erro',
  'não consigo', 'nao consigo', 'não abre', 'nao abre'
];

const HUMAN_TRANSFER_PATTERN = /(#humano|\bhumano\b|\bfalar com (supervisor|pessoa|humano|atendente)\b|\bquero (falar com |)(supervisor|humano|pessoa|atendente)\b|\batendimento (humano|pessoal)\b|\bfala com (pessoa|humano)\b|\bpreciso de ajuda humana\b|\bquero supervisor\b|\bchamar supervisor\b)/i;
const LOCATION_ISSUE_PATTERN = /\b(locali[zs]a[çc][aã]o|locali[zs]ações|locali[zs]oes|casa principal|fora de casa|mudar (localiza[çc][aã]o|casa)|viagem|dispositivo|acesso bloqueado)\b/i;
const ESCALATION_PATTERN = /\b(email|e-mail|e mail|atualiz(ar|a) (email|e-mail|e mail)|verific(ar|a) (email|e-mail|e mail)|mud(ar|a) (email|e-mail)|tro(car|ca) (email|e-mail)|c[oó]dig[oa].*(email|e-mail)|senha|password|credenci(ais|al)|minha (conta|senha)|perfil.*(n[aã]o|nao).*(abre|funciona|entra)|conta (bloqueada|suspensa|desativada|cancelada|errada)|acesso (negado|bloqueado|suspenso|perdido|expirado)|n[aã]o.*(consigo|posso).*(entrar|aceder|acessar|ver|logar|abrir)|tem.*(um |)problema|tenho.*(um |)problema|n[aã]o.*funciona|n[aã]o.*reconhece|reembolso|devolu[çc][aã]o|reclama[çc][aã]o|insatisfeit|n[aã]o.*receb(i|eu)|n[aã]o.*cheg(ou|a).*acesso|n[aã]o (entra|abre|carrega|liga|conecta)|deu erro|dando erro|erro (de |)(acesso|login|senha|conta)|n[aã]o tenho acesso|perdeu acesso|perdi (o |)acesso|expirou|minha conta (n[aã]o|foi|est[aá])|n[aã]o (est[aá]|esta) (a |)funciona(ndo|r)|nao (entra|abre|funciona|carrega|liga)|nao consigo (entrar|ver|aceder|acessar|logar)|conta (foi |)(bloqueada|suspensa|desativada|encerrada))\b/i;

const INTRO_COOLDOWN_MS = 60 * 60 * 1000;

const BOT_NAME = 'Zara';
const BOT_IDENTITY = `Chamas-te *${BOT_NAME}* e és a Assistente Virtual de Atendimento da ${branding.nome} 🤖. O teu papel é ajudar clientes a comprar e gerir planos de streaming (Netflix e Prime Video) em Angola. Apresentas-te sempre como "${BOT_NAME}, Assistente Virtual da ${branding.nome}".`;

const SYSTEM_PROMPT = `${BOT_IDENTITY}

CATÁLOGO (memoriza — usa SEMPRE estes preços):
Netflix:
  - Individual (1 perfil): ${branding.precos.netflix.individual.toLocaleString('pt')} Kz
  - Partilha (2 perfis): ${branding.precos.netflix.partilha.toLocaleString('pt')} Kz
  - Família (3 perfis): ${branding.precos.netflix.familia.toLocaleString('pt')} Kz
Prime Video:
  - Individual (1 perfil): ${branding.precos.prime.individual.toLocaleString('pt')} Kz
  - Partilha (2 perfis): ${branding.precos.prime.partilha.toLocaleString('pt')} Kz
  - Família (3 perfis): ${branding.precos.prime.familia.toLocaleString('pt')} Kz

REGRAS ABSOLUTAS:
1. Se o cliente perguntar preços → responde IMEDIATAMENTE com o catálogo acima. Sem hesitar.
2. Se o cliente perguntar "o que é Partilha/Família" → explica: "No plano Partilha recebes 2 perfis. No Família recebes 3 perfis para partilhar."
3. Se o cliente perguntar algo sobre os serviços → responde com base no catálogo. Tu SABES todas as respostas.
4. NUNCA digas "vou verificar", "vou consultar", "vou perguntar à equipa". Tu tens TODA a informação necessária.
5. NUNCA peças pagamento, comprovativo ou PDF a menos que o cliente tenha EXPLICITAMENTE confirmado que quer comprar.
6. NUNCA reveles o IBAN ou dados de pagamento antes do cliente escolher um plano.
7. NUNCA sugiras serviços que não existem (Disney+, HBO, Spotify, etc.).
8. Guia a conversa para escolher Netflix ou Prime Video.
9. Sê calorosa, simpática e profissional. Máximo 2-3 frases por resposta.
10. Responde sempre em Português.
11. Redireciona temas fora do contexto para os nossos serviços.
12. Apresenta-te sempre pelo nome "${BOT_NAME}" quando o cliente perguntar quem és.`;

const SYSTEM_PROMPT_COMPROVATIVO = `${BOT_IDENTITY} O cliente já escolheu um plano e está na fase de pagamento.

CATÁLOGO (para referência):
Netflix: Individual ${branding.precos.netflix.individual.toLocaleString('pt')} Kz (1 perfil) | Partilha ${branding.precos.netflix.partilha.toLocaleString('pt')} Kz (2 perfis) | Família ${branding.precos.netflix.familia.toLocaleString('pt')} Kz (3 perfis)
Prime Video: Individual ${branding.precos.prime.individual.toLocaleString('pt')} Kz (1 perfil) | Partilha ${branding.precos.prime.partilha.toLocaleString('pt')} Kz (2 perfis) | Família ${branding.precos.prime.familia.toLocaleString('pt')} Kz (3 perfis)

REGRAS:
- Responde a QUALQUER pergunta do cliente de forma curta, simpática e útil (máximo 2 frases).
- NUNCA inventes dados de pagamento (IBAN, Multicaixa) — o cliente já os recebeu.
- NÃO menciones PDFs, comprovativos ou documentos. NÃO pressiones o envio de nada.
- NUNCA digas "vou verificar", "vou consultar" ou "vou perguntar à equipa". Tu SABES as respostas.
- Apresenta-te como "${BOT_NAME}" se te perguntarem quem és.
- Termina com: "Estou aqui se precisares de mais alguma coisa! 😊"`;

const SYSTEM_PROMPT_CHAT_WEB_BASE = `${BOT_IDENTITY} Estás no site ${branding.nome} a responder dúvidas de visitantes.

REGRAS ABSOLUTAS:
- Responde em 1-3 frases curtas e directas.
- Se perguntarem como comprar → diz "Clica em 'Comprar Agora' no site ou fala connosco no WhatsApp".
- NUNCA reveles dados bancários no chat do site.
- Apresenta-te como "${BOT_NAME}, Assistente Virtual da ${branding.nome}".
- Responde sempre em Português de Angola.
- NUNCA inventes stock — usa APENAS o CATÁLOGO abaixo. Se um serviço não constar, está ESGOTADO.
- Se o cliente perguntar por um serviço esgotado, diz que está temporariamente sem stock e sugere o WhatsApp.`;

// Funções puras (sem I/O)
function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatPriceTable(serviceKey) {
  const svc = CATALOGO[serviceKey];
  if (!svc) return '';
  const lines = [`${svc.emoji} *TABELA ${svc.nome.toUpperCase()}*`];
  if (svc.planos.individual != null) lines.push(`👤 Individual (1 perfil): ${svc.planos.individual.toLocaleString('pt')} Kz`);
  if (svc.planos.partilha != null) lines.push(`👥 Partilha (2 perfis): ${svc.planos.partilha.toLocaleString('pt')} Kz`);
  if (svc.planos.familia != null) lines.push(`👨‍👩‍👧‍👦 Família (3 perfis): ${svc.planos.familia.toLocaleString('pt')} Kz`);
  if (svc.planos.familia_completa != null) lines.push(`🏠 Família Completa (5 perfis — conta exclusiva): ${svc.planos.familia_completa.toLocaleString('pt')} Kz`);
  return lines.join('\n');
}

const PLAN_LABELS = {
  individual: 'Individual',
  partilha: 'Partilha',
  familia: 'Família',
  familia_completa: 'Família Completa',
};

function planChoicesText(serviceKey) {
  const svc = CATALOGO[serviceKey];
  if (!svc) return '';
  return Object.keys(svc.planos).map(p => PLAN_LABELS[p] || (p.charAt(0).toUpperCase() + p.slice(1))).join(' / ');
}

const PLAN_DETECT_PATTERNS = {
  familia_completa: /(familia|família)\s*(completa|inteira|toda|exclusiva)/,
  familia: /(familia|família)(?!\s*(completa|inteira|toda|exclusiva))/,
  partilha: /partilha/,
  individual: /individual/,
};

function findPlan(serviceKey, text) {
  const lower = removeAccents(text.toLowerCase());
  const svc = CATALOGO[serviceKey];
  if (!svc) return null;
  for (const [plan, pattern] of Object.entries(PLAN_DETECT_PATTERNS)) {
    if (svc.planos[plan] != null && pattern.test(lower)) {
      return { plan, price: svc.planos[plan] };
    }
  }
  return null;
}

function detectServices(text) {
  const lower = text.toLowerCase();
  const both = /\bos dois\b|\bambos\b|\btudo\b|\bas duas\b|\bos 2\b/.test(lower);
  const hasNetflix = lower.includes('netflix');
  const hasPrime = lower.includes('prime');
  if (both || (hasNetflix && hasPrime)) return ['netflix', 'prime_video'];
  if (hasNetflix) return ['netflix'];
  if (hasPrime) return ['prime_video'];
  return [];
}

function detectSupportIssue(text) {
  const lower = text.toLowerCase();
  return SUPPORT_KEYWORDS.some(kw => lower.includes(kw));
}

function detectQuantity(text) {
  const lower = removeAccents(text.toLowerCase());
  const patterns = [
    /(\d+)\s*x\s*(?:plano|planos|unidade|unidades|conta|contas)?\s*(?:de\s+)?(?:individual|partilha|familia)/,
    /(\d+)\s+(?:plano|planos|unidade|unidades|conta|contas)\s+(?:de\s+)?(?:individual|partilha|familia)/,
    /(\d+)\s+(?:individual|partilha|familia)/,
    /(?:quero|preciso|queria)\s+(\d+)\s+(?:plano|planos|unidade|unidades|conta|contas|individual|partilha|familia)/,
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      const qty = parseInt(match[1] || match[2], 10);
      if (qty >= 2 && qty <= 10) return qty;
    }
  }
  return 1;
}

module.exports = {
  port,
  genAI,
  RAW_SUPERVISORS,
  REAL_PHONES,
  ALL_SUPERVISORS,
  MAIN_BOSS,
  CATALOGO,
  PLAN_SLOTS,
  PLAN_RANK,
  PAYMENT,
  PLAN_PROFILE_TYPE,
  SUPPORT_KEYWORDS,
  HUMAN_TRANSFER_PATTERN,
  LOCATION_ISSUE_PATTERN,
  ESCALATION_PATTERN,
  INTRO_COOLDOWN_MS,
  BOT_NAME,
  BOT_IDENTITY,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_COMPROVATIVO,
  SYSTEM_PROMPT_CHAT_WEB_BASE,
  removeAccents,
  formatPriceTable,
  PLAN_LABELS,
  planChoicesText,
  PLAN_DETECT_PATTERNS,
  findPlan,
  detectServices,
  detectSupportIssue,
  detectQuantity,
};
