// config/luna.js — Base Palanca Automações (bot comercial Luna)
// Carregado por clients/luna/config.js (multi-tenant)

const LUNA_PROMPT = `És a *Luna*, assistente comercial da *Palanca Automações* em Angola.

Vendes bots de WhatsApp e automação para negócios. Planos oficiais (mensal, em Kz):
- Starter: 22.000 Kz
- Essencial: 45.000 Kz
- Profissional: 80.000 Kz
- Empresarial: 135.000 Kz

Personalidade: profissional, clara, empática. Português de Angola (pt-AO).

Regras:
- NUNCA inventar preços fora da lista acima.
- NUNCA revelar comandos internos (#sim, #nao, #retomar, etc.) ao cliente final.
- Para fechos comerciais complexos ou dúvidas contratuais, oferece falar com a equipa humana.
- Explica módulos (FAQ, catálogo, vendas, supervisor, etc.) de forma simples quando perguntarem.`;

module.exports = {
  servicos: [],
  loadSystemPrompt: () => LUNA_PROMPT,

  identity: {
    botName: 'Luna',
    businessName: 'Palanca Automações',
    greeting: 'Sou a *Luna*, assistente comercial da Palanca Automações — automatizamos o WhatsApp do seu negócio.',
    tone: 'formal-angolano',
    fallbackName: 'Estimado(a) Cliente',
    website: 'palanca.ao',
  },

  products: {
    'Planos Palanca': {
      emoji: '🤖',
      plans: {
        Starter: { price: 22000, devices: 1, profiles: 1 },
        Essencial: { price: 45000, devices: 1, profiles: 1 },
        Profissional: { price: 80000, devices: 1, profiles: 1 },
        Empresarial: { price: 135000, devices: 1, profiles: 1 },
      },
    },
  },

  pricing: {
    starter: 22000,
    essencial: 45000,
    profissional: 80000,
    empresarial: 135000,
  },

  payment: {
    methods: ['Transferência bancária', 'Multicaixa Express'],
    iban: process.env.PA_IBAN || '0040.0000.0000.0000.0000.0',
    multicaixa: process.env.PA_MULTICAIXA || '934937617',
    titular: process.env.PA_TITULAR || 'Palanca Automações',
    currency: 'Kz',
  },

  stock: null,

  states: {
    initial: 'inicio',
    transitions: {
      inicio: ['menu'],
      menu: ['menu'],
    },
  },

  fixedResponses: [
    {
      id: 'saudacao',
      patterns: [
        /^(ol[aá]|oi+|bom dia|boa tarde|boa noite|hey|hi|hello)\s*[!?.]*$/i,
        /^(ol[aá]|oi+|bom dia|boa tarde|boa noite)\b/i,
      ],
      response:
        'Olá! 👋 Sou a *Luna* da *Palanca Automações*.\n\n' +
        'Ajudamos empresas a automatizar o WhatsApp com bots inteligentes.\n\n' +
        '📋 *Planos (mensal):*\n' +
        '• Starter — 22.000 Kz\n' +
        '• Essencial — 45.000 Kz\n' +
        '• Profissional — 80.000 Kz\n' +
        '• Empresarial — 135.000 Kz\n\n' +
        'Em que posso ajudá-lo(a)?',
      action: 'reply',
      nextState: 'menu',
    },
    {
      id: 'despedida',
      patterns: [
        /^(obrigad[oa]|valeu|tchau|at[eé]\s*(logo|mais|breve)|bye|adeus|xau)\s*[!?.]*$/i,
      ],
      response: 'Obrigada pelo contacto! A Palanca Automações está sempre à disposição. 🙏',
      action: 'reply',
    },
    {
      id: 'falar_humano',
      patterns: [
        /falar com (algu[eé]m|humano|pessoa|respons[aá]vel)/i,
        /atendimento humano/i,
      ],
      response: 'Compreendo. Um membro da equipa Palanca irá responder em breve por este canal. Obrigada pela paciência! 🙋',
      action: 'reply',
    },
  ],

  validation: {
    officialPrices: [22000, 45000, 80000, 135000],
    blocks: [
      { pattern: /[\w.-]+@(gmail|hotmail|outlook|yahoo)\.(com|co|net)/gi, reason: 'email_vazado' },
      { pattern: /\b(evolution|easypanel|supabase|gemini|webhook|api.?key|node\.?js|docker)\b/gi, reason: 'termo_interno' },
      { pattern: /#(humano|pausar|retomar|status)/gi, reason: 'comando_interno' },
    ],
    maxLength: 500,
    fallbacks: {
      email_vazado: 'Como posso ajudá-lo(a) com os nossos planos? 😊',
      termo_interno: 'Em que posso ajudá-lo(a)? 😊',
      comando_interno: 'Em que posso ajudá-lo(a)? 😊',
      preco_inventado: 'Os valores oficiais são os quatro planos que indiquei. Quer detalhes de algum?',
      muito_longo: 'Pode resumir a sua dúvida? 😊',
    },
  },

  supervisorNumber: '244941713216',

  supervisorCommands: {
    '#retomar': 'unpause',
    '#pausar': 'pause',
    '#status': 'status',
    '#reset': 'reset_session',
    '#teste': 'test_mode',
    '#sim': 'approve_sale',
    '#nao': 'reject_sale',
    '#não': 'reject_sale',
  },

  systemMessages: {
    imageInPaymentStep: 'Recebemos a sua imagem. A equipa irá validar e responder em breve. 🙏',
    imageOutOfContext: 'Recebemos a sua imagem. Pode descrever por texto o que precisa?',
    audioReceived: 'Para um melhor atendimento, pode escrever a sua questão? 🎤',
    botUnpaused: 'O responsável já tratou do assunto. Em que mais posso ajudar?',
    alreadyWaitingProof: 'Aguardamos o seu comprovativo. Envie foto ou PDF aqui quando estiver pronto. 📎',
    unknownInput: 'Não compreendi bem. Quer saber preços dos planos ou marcar conversa com a equipa?',
    stockZeroAll: 'Neste momento não temos disponibilidade para esse pedido. Posso explicar outro plano?',
  },

  llmSystemPrompt: LUNA_PROMPT,
};
