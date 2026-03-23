// engine/templates/nichos/nicho-restaurante.config.js — Template Restaurante / Take-away (Angola)

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
    niche: 'restaurante',
    greeting: `Olá! Sou {{BOT_NAME}}, do restaurante {{BUSINESS_NAME}} 🍽️\n\nBem-vindo!\n1️⃣ Ver menu\n2️⃣ Fazer pedido\n3️⃣ Delivery / take-away\n4️⃣ Horário e localização\n5️⃣ Falar com atendente`,
  },

  menu: {
    categories: [
      {
        name: 'Entradas',
        items: [
          { id: 'E001', name: 'Pastéis de bacalhau (6 un)', price: 1200, unit: 'Kz' },
          { id: 'E002', name: 'Salada mista', price: 1500, unit: 'Kz' },
          { id: 'E003', name: 'Sopa do dia', price: 900, unit: 'Kz' },
        ],
      },
      {
        name: 'Pratos Principais',
        items: [
          { id: 'P001', name: 'Frango grelhado + acompanhamento', price: 3500, unit: 'Kz' },
          { id: 'P002', name: 'Peixe frito + funge e feijão', price: 4000, unit: 'Kz' },
          { id: 'P003', name: 'Carne de vaca grelhada + batata frita', price: 5500, unit: 'Kz' },
          { id: 'P004', name: 'Mufete angolano completo', price: 6000, unit: 'Kz' },
          { id: 'P005', name: 'Cachupa (prato especial)', price: 3200, unit: 'Kz' },
        ],
      },
      {
        name: 'Bebidas',
        items: [
          { id: 'B001', name: 'Água mineral 0.5L', price: 300, unit: 'Kz' },
          { id: 'B002', name: 'Sumo natural (laranja/maracujá)', price: 700, unit: 'Kz' },
          { id: 'B003', name: 'Refrigerante lata', price: 500, unit: 'Kz' },
        ],
      },
    ],
  },

  faq: [
    { question: 'Horário de funcionamento', answer: 'Abrimos de segunda a domingo, das 11h às 22h (hora de Angola).' },
    { question: 'Fazem delivery?', answer: 'Sim! Entregamos em toda Luanda. Mínimo de pedido: 2.500 Kz.' },
    { question: 'Quais as zonas de entrega em Luanda?', answer: 'Entregamos em: Ingombota, Maianga, Rangel, Kilamba, Talatona, Viana e outras zonas. Para confirmar a tua zona, diz-nos o bairro.' },
    { question: 'Quanto tempo demora a entrega?', answer: 'Tempo médio de entrega: 30-45 minutos. Em horas de pico pode chegar a 60 minutos.' },
    { question: 'Têm take-away?', answer: 'Sim! Take-away disponível. Podes fazer o pedido aqui e levantar no restaurante.' },
    { question: 'Aceitam reservas?', answer: 'Sim, fazemos reservas de mesa. Fala com o nosso atendente.' },
  ],

  fixedResponses: {
    saudacao: `Olá! Bem-vindo ao {{BUSINESS_NAME}} 🍽️\n\nSou {{BOT_NAME}}!\n\n1️⃣ Ver menu completo\n2️⃣ Fazer pedido\n3️⃣ Delivery ou take-away?\n4️⃣ Horário e localização\n5️⃣ Reserva de mesa\n0️⃣ Falar com atendente`,
    menu: 'Vou enviar o nosso menu! Um momento... 📋',
    pedido: `Óptimo! Para fazer o teu pedido:\n1. Diz-me os pratos que queres e as quantidades\n2. Indica se é delivery ou take-away\n3. Para delivery: envia o teu endereço\n4. Confirma o pagamento\n\nEstamos a aguardar o teu pedido! 🍽️`,
    pagamento: `Formas de pagamento:\n💳 Multicaixa Express: {{WA_NUMBER}}\n💵 Dinheiro (só para take-away ou contra-entrega)\n\nApós pagamento, envia o comprovativo.`,
    entrega: `Zonas de delivery em Luanda:\n• Luanda centro: taxa 500 Kz\n• Arredores (Viana, Kilamba, Talatona): taxa 1.000 Kz\n\nTempo médio: 30-45 minutos`,
    horario: 'Estamos abertos de segunda a domingo, das 11h às 22h. Aos fins de semana das 10h às 23h. 🕐',
    promocao: 'Consulta as nossas promoções especiais! De sexta a domingo temos desconto de 10% em pedidos acima de 5.000 Kz.',
  },

  payment: {
    methods: ['multicaixa_express', 'dinheiro_na_entrega'],
    currency: 'Kz',
    multicaixaNumber: '{{WA_NUMBER}}',
    minimumOrder: 2500,
  },

  delivery: {
    zones: {
      centro: 500,
      arredores: 1000,
    },
    averageTimeMinutes: 40,
    minimumOrderKz: 2500,
  },

  states: ['inicio', 'menu', 'pedido', 'confirmacao', 'pagamento', 'entrega', 'concluido'],
};
