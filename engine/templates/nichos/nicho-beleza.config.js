// engine/templates/nichos/nicho-beleza.config.js — Template Salão de Beleza / Spa (Angola)

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
    niche: 'beleza',
    greeting: `Olá linda! Sou {{BOT_NAME}}, da {{BUSINESS_NAME}} 💅✨\n\nComo posso ajudar?\n1️⃣ Ver serviços e preços\n2️⃣ Agendar\n3️⃣ Cancelar / remarcar\n4️⃣ Horário\n5️⃣ Localização\n0️⃣ Falar com a equipa`,
  },

  services: [
    // Cabelo
    { id: 'C001', category: 'Cabelo', name: 'Corte simples', price: 2500, unit: 'Kz', duration: '30min' },
    { id: 'C002', category: 'Cabelo', name: 'Corte + escova', price: 4500, unit: 'Kz', duration: '60min' },
    { id: 'C003', category: 'Cabelo', name: 'Tranças (box braids)', price: 15000, unit: 'Kz', duration: '4-6h' },
    { id: 'C004', category: 'Cabelo', name: 'Alisamento / relaxamento', price: 8000, unit: 'Kz', duration: '2-3h' },
    // Unhas
    { id: 'U001', category: 'Unhas', name: 'Manicure simples', price: 2000, unit: 'Kz', duration: '45min' },
    { id: 'U002', category: 'Unhas', name: 'Manicure + pedicure', price: 3800, unit: 'Kz', duration: '90min' },
    { id: 'U003', category: 'Unhas', name: 'Unhas de gel (mãos)', price: 6500, unit: 'Kz', duration: '60min' },
    // Massagem
    { id: 'M001', category: 'Massagem', name: 'Massagem relaxante 60min', price: 7500, unit: 'Kz', duration: '60min' },
    { id: 'M002', category: 'Massagem', name: 'Massagem desportiva 45min', price: 6500, unit: 'Kz', duration: '45min' },
    // Makeup
    { id: 'K001', category: 'Makeup', name: 'Maquilhagem social', price: 5000, unit: 'Kz', duration: '45min' },
    { id: 'K002', category: 'Makeup', name: 'Maquilhagem noiva', price: 18000, unit: 'Kz', duration: '2h' },
  ],

  faq: [
    { question: 'Horário de funcionamento', answer: 'Atendemos de terça a domingo, das 9h às 19h. Segunda fechado.' },
    { question: 'Como faço para agendar?', answer: 'Podes agendar aqui pelo WhatsApp! Basta dizer que serviço queres e em que dia/hora.' },
    { question: 'Preciso de confirmação?', answer: 'Sim. Após o agendamento, confirmamos por WhatsApp. Confirmar 24h antes por favor.' },
    { question: 'Posso cancelar ou remarcar?', answer: 'Sim, mas com antecedência mínima de 2h. Cancelamentos com menos de 2h podem ter taxa de 50%.' },
    { question: 'Aceitam walk-in (sem marcação)?', answer: 'Sim, se houver disponibilidade. Recomendamos sempre agendar com antecedência.' },
  ],

  fixedResponses: {
    saudacao: `Olá! Bem-vinda à {{BUSINESS_NAME}} 💅✨\n\nSou {{BOT_NAME}}, tua assistente!\n\n1️⃣ Serviços e preços\n2️⃣ Agendar\n3️⃣ Remarcar / cancelar\n4️⃣ Horário\n5️⃣ Localização\n0️⃣ Falar com a nossa equipa`,
    servicos: `Os nossos serviços:\n\n💇 *Cabelo*: corte, escova, tranças, alisamento\n💅 *Unhas*: manicure, pedicure, gel\n🧖 *Massagem*: relaxante, desportiva\n💄 *Makeup*: social, noiva\n\nDi-me qual te interessa para saber o preço exacto!`,
    precos: 'Os nossos preços variam de 2.000 Kz (manicure) a 18.000 Kz (makeup noiva). Diz-me o serviço específico para mais detalhes.',
    agendar: `Para agendar:\n1. Diz-me que serviço queres\n2. O dia e hora preferidos\n3. O teu nome\n\nConfirmamos a disponibilidade e reservamos o teu horário! 📅`,
    horario: 'Estamos abertas de terça a domingo, das 9h às 19h. Segunda-feira fechado. Para horários especiais (fins de semana), ligar com antecedência.',
    cancelar: 'Para cancelar ou remarcar, diz-me o teu nome e o horário agendado. Lembra-te: cancela com pelo menos 2h de antecedência.',
  },

  payment: {
    methods: ['multicaixa_express', 'dinheiro'],
    currency: 'Kz',
    multicaixaNumber: '{{WA_NUMBER}}',
  },

  booking: {
    advanceNoticeHours: 2,
    cancellationFeePercent: 50,
    reminderBeforeHours: 24,
  },

  states: ['inicio', 'menu', 'servico', 'agendamento', 'confirmacao', 'concluido'],
};
