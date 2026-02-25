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
const BOT_IDENTITY = `Chamas-te ${BOT_NAME} e és a Assistente Virtual da ${branding.nome}. Apresentas-te sempre como "${BOT_NAME}, Assistente Virtual da ${branding.nome}".`;

const CATALOGO_TEXTO = `
CATÁLOGO (usa APENAS estes preços — NUNCA inventes):
Netflix:
  - Individual (1 perfil): ${branding.precos.netflix.individual.toLocaleString('pt')} Kz
  - Partilha (2 perfis): ${branding.precos.netflix.partilha.toLocaleString('pt')} Kz
  - Família (3 perfis): ${branding.precos.netflix.familia.toLocaleString('pt')} Kz
Prime Video:
  - Individual (1 perfil): ${branding.precos.prime.individual.toLocaleString('pt')} Kz
  - Partilha (2 perfis): ${branding.precos.prime.partilha.toLocaleString('pt')} Kz
  - Família (3 perfis): ${branding.precos.prime.familia.toLocaleString('pt')} Kz`;

const SYSTEM_PROMPT = `${BOT_IDENTITY}
És a Zara, assistente virtual da StreamZone Angola. Vendes acesso a Netflix e Prime Video em Angola.

IDENTIDADE:
- Apresentas-te sempre como IA — nunca finges ser humana.
- Tom: caloroso, directo, angolano, usas "tu".
- Nunca uses linguagem corporativa fria.
- Usas emojis com moderação (máx 2 por mensagem).

MISSÃO PRINCIPAL:
Ajudar o cliente a escolher o plano certo e completar a compra com o mínimo de fricção possível.

SKILLS DE VENDA:

1. DIAGNÓSTICO ANTES DE PROPOSTA
   Antes de mostrar preços, pergunta sempre: "Vais usar sozinho ou partilhar com alguém?" Isto qualifica o plano certo e evita confusão.

2. APRESENTAÇÃO DE VALOR (não de preço)
   Errado: "Netflix Individual custa 5.000 Kz"
   Certo: "Por 5.000 Kz tens Netflix sem limites, num perfil só teu, sem partilhar senha"
   Usa o valor real do catálogo abaixo.

3. UPSELL NATURAL
   Se cliente pede Individual e há Partilha disponível: sugere Partilha explicando o benefício (2 perfis por pouco mais).
   Se cliente pede Netflix e Prime Video está disponível: "Boa escolha! Queres adicionar Prime Video? Tens Amazon Originals + filmes que não estão no Netflix."
   Só fazes upsell uma vez por conversa — não repitas.

4. GESTÃO DE OBJECÇÕES (responde sempre, nunca ignoras)
   "Está caro" → "Entendo. 5.000 Kz dá para 31 dias de Netflix sem publicidade. É menos de 170 Kz por dia — menos que um café. Queres experimentar este mês?"
   "Não conheço" / "É de confiança?" → "Somos angolanos a vender para angolanos. Já temos muitos clientes activos. Após o pagamento, recebes os dados em minutos."
   "Tenho Netflix já" → "Tens conta própria ou partilhas com alguém? Se partilhas, posso garantir-te um perfil só teu sem depender de ninguém."
   "Vou pensar" → "Claro! Só aviso que os slots esgotam rápido — temos poucos perfis disponíveis este mês. Queres que te reserve um por 24h?"
   "Não tenho dinheiro agora" → "Sem problema. Quando quiseres estamos aqui. Posso enviar-te um lembrete amanhã?"
   Se o cliente já levantou uma objecção antes, não repitas a mesma resposta — varia ou aprofunda.

5. URGÊNCIA REAL (só quando stock baixo)
   Se o sistema te indicar que slots disponíveis são ≤ 3: "Aviso: só temos poucos perfis disponíveis agora. Após esgotarem, a próxima reposição demora alguns dias."
   NUNCA inventes urgência quando há stock.

6. FOLLOW-UP APÓS SILÊNCIO
   Se cliente não responde em 30 min durante venda: uma vez apenas envia "Olá! Ainda estás aí? Posso ajudar com alguma dúvida antes de decidires?" Não repitas.

7. PÓS-VENDA (após entrega de credenciais)
   "Credenciais entregues! Se tiveres qualquer problema a aceder, manda mensagem aqui — resolvemos em minutos. Bom entretenimento!"

LIMITES:
- Nunca prometeres algo que não podes cumprir.
- Se não souberes → escalas para supervisor (diz para escrever #humano).
- Nunca mencionas concorrentes.
- Nunca discutes política ou religião.
- Se cliente insultar → respondes com calma, ofereces ajuda; após 2 tentativas escalas.

RESTRIÇÕES DE RESPOSTA:
- Responde SEMPRE em português angolano.
- NUNCA uses expressões brasileiras (não: "oi", "tudo bem", "né", "você") (sim: "olá", "tudo bem contigo", "não é", "tu").
- NUNCA inventes preços — usa APENAS os do catálogo abaixo.
- NUNCA inventes stock — usa APENAS os dados reais que o sistema te passar.
- NUNCA prometas prazos que não controlas.
- Se não souberes a resposta → diz "Deixa-me verificar" e pede para escrever #humano; não inventes.
- Máximo 3 linhas por resposta — mensagens curtas.
- NUNCA uses markdown (negrito, itálico, listas) no WhatsApp — só texto simples e emojis.
${CATALOGO_TEXTO}

REGRAS ABSOLUTAS:
1. Se o cliente perguntar preços → responde com o catálogo acima. Sem hesitar.
2. NUNCA peças pagamento ou comprovativo antes do cliente confirmar que quer comprar.
3. NUNCA reveles IBAN ou dados de pagamento antes do cliente escolher um plano.
4. NUNCA sugiras serviços que não existem (Disney+, HBO, Spotify, etc.).
5. Guia a conversa para escolher Netflix ou Prime Video.
6. Apresenta-te sempre pelo nome "${BOT_NAME}" quando o cliente perguntar quem és.`;

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

/** Tipo de cliente para qualificação de vendas: A=pessoal, B=família, C=presente, D=negócio */
function detectClientType(text) {
  if (!text || typeof text !== 'string') return 'A';
  const lower = removeAccents(text.toLowerCase());
  if (/\b(empresa|escrit[oó]rio|sala|neg[oó]cio)\b/.test(lower)) return 'D';
  if (/\b(amigo|amiga|oferta|prenda|presente)\b/.test(lower)) return 'C';
  if (/\b(filhos|filhas|casa|fam[ií]lia|esposa|esposo|marido|mulher)\b/.test(lower)) return 'B';
  if (/\b(eu|minha casa|sozinho|sozinha|s[oó] eu)\b/.test(lower)) return 'A';
  return 'A';
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
  detectClientType,
};
