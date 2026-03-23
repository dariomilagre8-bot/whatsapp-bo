// engine/templates/nichos/nicho-streaming.config.js — Template Streaming / IPTV (Angola)
// Baseado na estrutura StreamZone — substitui nomes específicos por placeholders

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
    niche: 'streaming',
    greeting: `Olá! Sou {{BOT_NAME}}, assistente da {{BUSINESS_NAME}} 📺\n\nComo posso ajudar?\n1️⃣ Planos e preços\n2️⃣ Activar / renovar\n3️⃣ Suporte técnico\n4️⃣ Pagamento\n5️⃣ Falar com atendente`,
  },

  // Catálogo de planos (preços em Kz — editar para planos reais)
  plans: [
    { id: 'PLN01', name: 'Plano Básico', screens: 1, price: 2500, priceMonthly: 2500, unit: 'Kz', duration: '30 dias', features: ['HD', '1 ecrã', 'sem downloads'] },
    { id: 'PLN02', name: 'Plano Standard', screens: 2, price: 4000, priceMonthly: 4000, unit: 'Kz', duration: '30 dias', features: ['Full HD', '2 ecrãs simultâneos', 'downloads limitados'] },
    { id: 'PLN03', name: 'Plano Premium', screens: 4, price: 6500, priceMonthly: 6500, unit: 'Kz', duration: '30 dias', features: ['4K + HDR', '4 ecrãs simultâneos', 'downloads ilimitados'] },
    { id: 'PLN04', name: 'Plano Anual Basic', screens: 1, price: 25000, unit: 'Kz', duration: '365 dias', features: ['HD', '1 ecrã', 'poupa 2 meses'] },
    { id: 'PLN05', name: 'Plano Anual Premium', screens: 4, price: 65000, unit: 'Kz', duration: '365 dias', features: ['4K', '4 ecrãs', 'poupa 2 meses', 'suporte prioritário'] },
  ],

  faq: [
    { question: 'O que é o serviço?', answer: '{{BUSINESS_NAME}} é um serviço de streaming que te dá acesso a filmes, séries, canais ao vivo e muito mais.' },
    { question: 'Em que dispositivos funciona?', answer: 'Funciona em Smart TV, telemóvel, tablet, computador e Fire Stick. Qualquer dispositivo com internet.' },
    { question: 'A internet tem de ser rápida?', answer: 'Recomendamos no mínimo 5 Mbps para HD e 25 Mbps para 4K. A maioria das ligações angolanas é suficiente.' },
    { question: 'Como activo?', answer: 'Após o pagamento, enviamos os dados de acesso por WhatsApp em até 1 hora.' },
    { question: 'Posso partilhar a conta?', answer: 'Depende do plano. O Plano Básico é só para 1 pessoa. O Premium permite 4 ecrãs em simultâneo.' },
    { question: 'O que faço se não funcionar?', answer: 'Envia-nos uma mensagem descrevendo o problema. Resolvemos em até 2 horas (horário comercial).' },
    { question: 'Como renovar?', answer: 'Avisa-nos aqui pelo WhatsApp antes do vencimento. Processamos a renovação em minutos.' },
  ],

  fixedResponses: {
    saudacao: `Olá! Bem-vindo à {{BUSINESS_NAME}} 📺🎬\n\nSou {{BOT_NAME}}!\n\n1️⃣ Ver planos e preços\n2️⃣ Comprar / activar\n3️⃣ Renovar subscrição\n4️⃣ Suporte técnico\n5️⃣ Pagamento\n0️⃣ Falar com atendente`,
    planos: `Os nossos planos 📺\n\n🔵 *Básico* — 2.500 Kz/mês (1 ecrã, HD)\n🟡 *Standard* — 4.000 Kz/mês (2 ecrãs, Full HD)\n🟣 *Premium* — 6.500 Kz/mês (4 ecrãs, 4K)\n\nPlanos anuais com desconto disponíveis!\n\nQual te interessa?`,
    activar: `Para activar a tua conta:\n1. Escolhe o plano\n2. Faz o pagamento via Multicaixa Express\n3. Envia o comprovativo\n4. Recebe os dados de acesso em até 1h!\n\nQual plano queres? 📺`,
    renovar: `Para renovar:\n1. Diz-nos o teu e-mail/utilizador\n2. Confirma o plano actual\n3. Faz o pagamento\n4. Renovado em minutos!\n\nQual é o teu e-mail de acesso?`,
    pagamento: `Formas de pagamento:\n💳 Multicaixa Express: {{WA_NUMBER}}\n🏦 Referência Multicaixa (disponível a pedido)\n\nApós o pagamento, envia o comprovativo com o teu nome.`,
    suporte: `Suporte técnico 🔧\n\nProblemas comuns:\n• Sem imagem → verificar internet + reiniciar app\n• Conta bloqueada → pagamento pendente?\n• Buffering → testar velocidade em fast.com\n\nDescre o teu problema que resolvemos!`,
    ajuda: 'Estou aqui para ajudar! Diz-me o que precisas: activar conta, renovar, suporte técnico ou preços?',
  },

  support: {
    responseTimeHours: 2,
    workingHours: '8h-22h',
    commonIssues: ['sem_imagem', 'buffering', 'conta_bloqueada', 'dados_incorrectos'],
  },

  payment: {
    methods: ['multicaixa_express', 'referencia_multicaixa'],
    currency: 'Kz',
    multicaixaNumber: '{{WA_NUMBER}}',
    activationTimeHours: 1,
  },

  states: ['inicio', 'menu', 'planos', 'compra', 'pagamento', 'activacao', 'suporte', 'supervisor', 'concluido'],
};
