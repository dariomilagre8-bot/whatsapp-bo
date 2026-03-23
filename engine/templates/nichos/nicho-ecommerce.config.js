// engine/templates/nichos/nicho-ecommerce.config.js — Template E-commerce (Angola)
// Placeholders substituídos por scripts/novo-cliente.sh

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
    niche: 'ecommerce',
    greeting: `Olá! Sou {{BOT_NAME}}, assistente da {{BUSINESS_NAME}} 👗\n\nComo posso ajudar?\n1️⃣ Ver catálogo\n2️⃣ Preços e stock\n3️⃣ Como encomendar\n4️⃣ Pagamento e entrega\n5️⃣ Falar com atendente`,
  },

  // Catálogo de produtos (editar com produtos reais)
  catalog: [
    { id: 'P001', name: 'Camiseta Casual', price: 4500, unit: 'Kz', sizes: ['S', 'M', 'L', 'XL'], colors: ['Branco', 'Preto', 'Azul'] },
    { id: 'P002', name: 'Vestido Floral', price: 8500, unit: 'Kz', sizes: ['P', 'M', 'G'], colors: ['Rosa', 'Verde'] },
    { id: 'P003', name: 'Calça Jeans Slim', price: 7200, unit: 'Kz', sizes: ['36', '38', '40', '42'], colors: ['Azul claro', 'Azul escuro'] },
    { id: 'P004', name: 'Sapatilha Desportiva', price: 11000, unit: 'Kz', sizes: ['37', '38', '39', '40', '41', '42'], colors: ['Branco', 'Preto'] },
    { id: 'P005', name: 'Mala de Mão', price: 6500, unit: 'Kz', colors: ['Preto', 'Castanho', 'Bege'] },
  ],

  faq: [
    { question: 'Horário de funcionamento', answer: 'Atendemos de segunda a sábado, das 8h às 20h (hora de Angola).' },
    { question: 'Onde estão localizados?', answer: 'Estamos em Luanda. Entregamos em toda a cidade e outros provincias.' },
    { question: 'Quanto tempo demora a entrega?', answer: 'Entrega em Luanda: 1-2 dias úteis. Outras províncias: 3-5 dias úteis.' },
    { question: 'Formas de pagamento', answer: 'Aceitamos Multicaixa Express, referência Multicaixa e transferência bancária.' },
    { question: 'Posso trocar se não gostar?', answer: 'Sim! Trocas em até 7 dias, produto sem uso e com etiqueta. Só paga o frete de volta.' },
    { question: 'Os produtos têm garantia?', answer: 'Sim, 30 dias de garantia contra defeitos de fabricação.' },
  ],

  fixedResponses: {
    saudacao: `Olá! Bem-vindo(a) à {{BUSINESS_NAME}} 🛍️\n\nSou {{BOT_NAME}}, tua assistente de compras!\n\nO que procuras hoje?\n1️⃣ Ver catálogo\n2️⃣ Preços\n3️⃣ Como encomendar\n4️⃣ Pagamento\n5️⃣ Entrega\n0️⃣ Falar com atendente`,
    despedida: 'Obrigado pela visita à {{BUSINESS_NAME}}! Até a próxima compra 🛍️',
    catalogo: 'Vou enviar o nosso catálogo completo! Um momento...',
    preco: 'Os nossos preços vão de 4.500 Kz a 11.000 Kz. Para ver o preço de um produto específico, diz-me qual te interessa.',
    stock: 'Para verificar a disponibilidade de um produto específico, diz-me qual é e o teu tamanho.',
    encomenda: `Para encomendar:\n1. Escolhe o produto e tamanho\n2. Dá-nos o teu endereço de entrega\n3. Confirma o pagamento via Multicaixa Express\n4. Aguarda a entrega!\n\nQuer começar agora?`,
    pagamento: `Formas de pagamento:\n💳 Multicaixa Express: enviar para o número {{WA_NUMBER}}\n🏦 Referência Multicaixa: disponível após confirmação do pedido\n\nApós o pagamento, envia o comprovativo por aqui.`,
    entrega: `Prazos de entrega:\n📦 Luanda: 1-2 dias úteis (frete: 500 Kz)\n🚚 Outras províncias: 3-5 dias úteis (frete: 1.500 Kz)\n\nEntregamos na tua porta!`,
    ajuda: `Posso ajudar-te com:\n1️⃣ Catálogo de produtos\n2️⃣ Preços e promoções\n3️⃣ Encomendar\n4️⃣ Pagamento\n5️⃣ Entrega e rastreamento\n0️⃣ Falar com um humano\n\nO que precisas?`,
  },

  payment: {
    methods: ['multicaixa_express', 'referencia_multicaixa', 'transferencia'],
    currency: 'Kz',
    multicaixaNumber: '{{WA_NUMBER}}',
  },

  states: ['inicio', 'menu', 'catalogo', 'escolha', 'confirmacao', 'pagamento', 'supervisor', 'concluido'],
};
