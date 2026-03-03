// Todas as variáveis de ambiente e constantes derivadas (sem I/O async)
const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '..', process.env.NODE_ENV === 'test' ? '.env.test' : '.env'),
});
const branding = require('../branding');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const port = process.env.PORT || 80;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Em modo teste usa PHONE_NUMBERS e BOSS_NUMBER do .env.test; em produção usa SUPERVISOR_NUMBER
const isTest = process.env.NODE_ENV === 'test';
const supervisorsSource = isTest
  ? (process.env.PHONE_NUMBERS || process.env.BOSS_NUMBER || process.env.SUPERVISOR_NUMBER || '')
  : (process.env.SUPERVISOR_NUMBER || '');
const RAW_SUPERVISORS = supervisorsSource.split(',').map(n => n.trim().replace(/\D/g, '')).filter(Boolean);
const REAL_PHONES = RAW_SUPERVISORS.filter(n => n.length < 15);
const ALL_SUPERVISORS = RAW_SUPERVISORS;
const MAIN_BOSS = isTest && process.env.BOSS_NUMBER
  ? String(process.env.BOSS_NUMBER).replace(/\D/g, '')
  : (REAL_PHONES.length > 0 ? REAL_PHONES[0] : null);

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

const RESPOSTAS_FIXAS = {
  // PRÉ-VENDA
  preco: [
    /está caro/i, /é caro/i, /muito caro/i,
    /caro demais/i, /prime está caro/i,
    /netflix está caro/i, /não tenho dinheiro/i,
    /sem dinheiro/i, /tá caro/i,
  ],
  saida: [
    /vou pensar/i, /deixa estar/i,
    /talvez depois/i, /não preciso/i,
    /esquece/i, /desisti/i,
  ],
  confianca: [
    /é de confiança/i, /é seguro/i,
    /não conheço/i, /é real/i,
    /é fraude/i, /é golpe/i, /é fiável/i,
  ],
  ja_tem: [
    /já tenho netflix/i, /já tenho prime/i,
    /já tenho conta/i, /já sou cliente/i,
  ],
  // STOCK ESGOTADO
  stock_esgotado_netflix: [
    /quando volta netflix/i, /netflix disponível/i,
    /netflix quando/i, /só quero netflix/i,
    /não quero prime/i, /quero mesmo netflix/i,
  ],
  // PÓS-VENDA
  nao_entra: [
    /não entra/i, /nao entra/i, /não consigo entrar/i,
    /não abre/i, /não funciona/i, /deu erro/i,
    /senha errada/i, /palavra-passe errada/i,
    /credenciais erradas/i, /não aceita/i,
    /conta bloqueada/i, /perfil bloqueado/i,
    /perdi acesso/i, /sem acesso/i,
  ],
  localizacao: [
    /ver temporariamente/i, /dispositivo/i,
    /fora de casa/i, /residência/i, /residencia/i,
    /não faz parte/i, /nao faz parte/i, /localização/i,
    /código netflix/i, /verificar localização/i,
  ],
  pin: [
    /pin errado/i, /esqueci o pin/i,
    /pin do perfil/i, /código do perfil/i,
    /mudar pin/i, /alterar pin/i,
  ],
  email_senha: [
    /qual é o email/i, /qual o email/i,
    /esqueci o email/i, /qual a senha/i,
    /esqueci a senha/i, /reenviar credenciais/i,
    /mandar de novo/i, /enviar novamente/i,
    /não recebi/i, /credenciais/i,
  ],
  renovacao: [
    /renovar/i, /renovação/i, /expirou/i,
    /acabou/i, /venceu/i, /expirar/i,
    /quando expira/i, /quanto tempo falta/i,
  ],
  cancelamento: [
    /quero cancelar/i, /cancelar plano/i,
    /não quero mais/i, /quero sair/i,
    /reembolso/i, /devolver dinheiro/i,
  ],
  upgrade: [
    /quero mudar de plano/i, /upgrade/i,
    /mudar para família/i, /adicionar perfil/i,
    /quero mais perfis/i,
  ],
};

const RESPOSTAS_TEXTO = {
  preco: (plano, preco) =>
    `${preco.toLocaleString('pt')} Kz dá para 31 dias de ${plano}. É menos de ${Math.round(preco / 31)} Kz por dia — menos que um refrigerante. Queres experimentar este mês? 😊`,
  saida: () =>
    `Claro! Só aviso que os slots esgotam rápido. Queres que te reserve um por 24h? 😊`,
  confianca: () =>
    `Somos angolanos a vender para angolanos 🇦🇴 Clientes activos este mês, entrega em minutos após pagamento. Tens mais alguma dúvida?`,
  ja_tem: () =>
    `Tens conta própria ou partilhas com alguém? Se partilhas, garanto-te um perfil só teu sem depender de ninguém. 😊`,
  stock_esgotado_netflix: (primeDisponivel) =>
    primeDisponivel
      ? `Netflix está esgotado neste momento 😔 Temos Prime Video disponível — Amazon Originals + filmes exclusivos por 3.000 Kz. Queres experimentar enquanto esperamos reposição?`
      : `Netflix está esgotado neste momento 😔 Posso colocar-te em lista de espera e aviso-te assim que tiver disponível. Queres?`,
  nao_entra: () =>
    `Vou resolver isso agora. Responde-me: qual é o erro exacto que aparece? (ex: "senha incorrecta", "conta bloqueada", "muitos utilizadores") 🔧`,
  localizacao: () =>
    `Erro de localização Netflix! Segue estes passos:\n1️⃣ Clica em "Ver temporariamente"\n2️⃣ Aparece um código numérico\n3️⃣ Insere o código\n4️⃣ Acesso restaurado ✅\nSe não resultar avisa-me!`,
  pin: () =>
    `Para o PIN do perfil: entra na conta → clica no perfil → Gerir Perfil → PIN. Se não consegues aceder envia-me o nome do perfil e resolvo. 🔧`,
  email_senha: () =>
    `Vou reenviar as tuas credenciais agora. Um momento... 📧`,
  renovacao: (diasRestantes) =>
    diasRestantes > 0
      ? `O teu plano expira em ${diasRestantes} dias. Queres renovar agora com o mesmo plano? 😊`
      : `O teu plano expirou. Queres renovar? Processo rápido — mesmo plano, mesmo preço. 😊`,
  imagem_sem_contexto: () =>
    `Recebi a tua imagem 📎 Para comprovativos de pagamento envia em PDF. Para problemas técnicos descreve o que está a acontecer e resolvo. 😊`,
  imagem_com_keywords_netflix: () =>
    `Vejo que tens um erro de localização. Segue estes passos:\n1️⃣ Clica "Ver temporariamente"\n2️⃣ Insere o código que aparece\n3️⃣ Acesso restaurado ✅`,
  cancelamento: () =>
    `Lamento ouvir isso 😔 Para processar o cancelamento preciso falar com um colega. Um momento! 😊`,
  upgrade: (planoActual) =>
    `Claro! Actualmente tens ${planoActual}.\nQueres mudar para que plano?\n- Partilha (2 perfis)\n- Família (3 perfis)\n- Família Completa (conta exclusiva)`,
};

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
És a Zara, assistente de vendas da StreamZone Angola.
Vendes Netflix e Prime Video. Nunca finges ser humana.

LÍNGUA: português angolano. Nunca: "você","oi","né","tudo bem?".
Sempre: "tu","olá". Máx 2 frases. Sem markdown. Sem listas.

STOCK ACTUAL: [STOCK_PLACEHOLDER]
${CATALOGO_TEXTO}

QUANDO CLIENTE QUER COMPRAR:
1. Pergunta: "Vais usar sozinho ou partilhar?"
2. Apresenta o plano certo com valor diário (preço/31)
3. Nunca inventas preços ou stock

QUANDO NÃO SOUBERES: diz "Deixa-me verificar" e para.
Nunca inventas. Nunca alucinares. Se dúvida → paras.`;

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
  RESPOSTAS_FIXAS,
  RESPOSTAS_TEXTO,
};
