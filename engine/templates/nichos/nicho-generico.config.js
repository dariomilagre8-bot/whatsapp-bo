// engine/templates/nichos/nicho-generico.config.js — Template Genérico (qualquer negócio)
// Template mínimo funcional — adaptar para o negócio específico

module.exports = {
  clientSlug: '{{CLIENT_SLUG}}',
  slug: '{{CLIENT_SLUG}}',
  botName: '{{BOT_NAME}}',
  businessName: '{{BUSINESS_NAME}}',
  evolutionInstance: '{{EVOLUTION_INSTANCE}}',
  supervisors: ['{{SUPERVISOR}}'],
  waNumber: '{{WA_NUMBER}}',

  modules: {
    faq: false,
    catalog: false,
    sales: false,
    stock: false,
    supervisor: false,
    followup: false,
    waitlist: false,
    reports: false,
    complaints: false,
    crm: false,
    leads: false,
  },

  identity: {
    botName: '{{BOT_NAME}}',
    businessName: '{{BUSINESS_NAME}}',
    niche: 'generico',
    greeting: `Olá! Sou {{BOT_NAME}}, assistente da {{BUSINESS_NAME}} 👋\n\nComo posso ajudar?\n1️⃣ Informações\n2️⃣ Serviços / Produtos\n3️⃣ Horário\n4️⃣ Localização\n5️⃣ Contacto\n0️⃣ Falar com atendente`,
  },

  faq: [
    { question: 'Horário de funcionamento', answer: 'Atendemos de segunda a sexta, das 8h às 18h, e aos sábados das 8h às 13h.' },
    { question: 'Onde estão localizados?', answer: 'Estamos em Luanda. Contacta-nos para mais detalhes sobre a localização exacta.' },
    { question: 'Quais os contactos?', answer: `Podes contactar-nos por:\n📱 WhatsApp: {{WA_NUMBER}}\n📍 Luanda, Angola` },
    { question: 'Formas de pagamento', answer: 'Aceitamos Multicaixa Express e transferência bancária.' },
  ],

  fixedResponses: {
    saudacao: `Olá! Bem-vindo à {{BUSINESS_NAME}} 👋\n\nSou {{BOT_NAME}}, aqui para ajudar!\n\n1️⃣ Informações gerais\n2️⃣ Os nossos serviços\n3️⃣ Horário\n4️⃣ Localização\n0️⃣ Falar com a equipa`,
    despedida: 'Obrigado pelo contacto! Até à próxima. A {{BUSINESS_NAME}} está sempre disponível para ajudar. 👋',
    informacao: 'Estou aqui para responder às tuas questões sobre a {{BUSINESS_NAME}}. O que precisas de saber?',
    servicos: 'Para saber mais sobre os nossos serviços e produtos, diz-me o que procuras especificamente.',
    horario: 'Atendemos de segunda a sexta, das 8h às 18h, e sábados das 8h às 13h. Ao domingo estamos fechados.',
    localizacao: 'Estamos localizados em Luanda, Angola. Para endereço exacto e indicações, fala com o nosso atendente.',
    ajuda: `Posso ajudar-te com:\n• Informações sobre os nossos serviços\n• Horário e localização\n• Formas de pagamento\n• Colocar em contacto com a equipa\n\nO que precisas? 😊`,
    supervisor: 'Vou chamar um membro da nossa equipa para te atender pessoalmente. Um momento...',
  },

  payment: {
    methods: ['multicaixa_express', 'transferencia'],
    currency: 'Kz',
    multicaixaNumber: '{{WA_NUMBER}}',
  },

  states: ['inicio', 'menu', 'info', 'supervisor', 'concluido'],
};
