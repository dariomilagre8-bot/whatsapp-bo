// config/demo.js — Base Loja Demo (bot Bia) para demonstrações
// Carregado por clients/demo/config.js (instância Evolution demo-moda)

'use strict';

const DEMO_PROMPT = `És a *Bia*, assistente virtual da *Loja Demo* — loja de roupa online (demonstração Palanca).

Personalidade: simpática, profissional. Português angolano (pt-AO).

Preços oficiais dos artigos (Kz):
- Camisola Básica: 3.500
- Vestido Elegante: 8.000
- Calças Jeans: 5.500
- Sapatos Desportivos: 7.000
- Bolsa Feminina: 4.500

Regras:
- NUNCA revelar comandos internos (#sim, #nao, etc.)
- NUNCA inventar preços fora da lista
- Para pedidos: produto, tamanho (se aplicável), entrega, pagamento`;

module.exports = {
  identity: {
    botName: 'Bia',
    businessName: 'Loja Demo',
  },
  nome: 'Loja Demo',
  numero: '244958765478',
  supervisorNumbers: ['244941713216'],
  plano: 'empresarial',
  ativo: true,
  stock: null,
  payment: null,
  products: null,

  states: {
    initial: 'inicio',
    transitions: {
      inicio: ['menu'],
      menu: ['menu'],
    },
  },

  saudacao: `Olá! 👗 Bem-vindo/a à *Loja Demo*!

Sou a *Bia*, a sua assistente virtual. Posso ajudar com:

👗 Ver o catálogo
💰 Consultar preços
🛍️ Fazer um pedido
📦 Informações de entrega

O que posso fazer por si?`,

  horario: {
    inicio: 8,
    fim: 20,
    diasSemana: [1, 2, 3, 4, 5, 6],
    fusoHorario: 'Africa/Luanda',
    msgFora: `Olá! 😊 Neste momento estamos fora do horário.

⏰ *Seg–Sáb, 8h–20h* (Luanda).
Deixe a sua mensagem — respondemos em breve! 🙏`,
  },

  triggers: {
    catalogo: /\b(catálogo|catalogo|produtos?|ver (produtos?|roupa|peças?)|o que têm|lista)\b/i,
    precos: /\b(preço|precio|quanto (custa|é|vale)|valor|kz)\b/i,
    pedido: /\b(quero|comprar|encomendar|pedir|order)\b/i,
    entrega: /\b(entrega?|entregar|frete|portes?|envio)\b/i,
    tamanhos: /\b(tamanho|medida|guia|numeração|talla|size)\b/i,
    pagamento: /\b(pagar|pagamento|multicaixa|transferência|forma de pag)\b/i,
    localizacao: /\b(onde|loja|endereço|localiz|morada|fica)\b/i,
    trocas: /\b(troca|devol|devolucao|retorno)\b/i,
    promocao: /\b(promoç|desconto|oferta|sale|saldo)\b/i,
    saudacao: /^(olá|ola|oi|bom dia|boa tarde|boa noite|hey|hi|hello)\b/i,
  },

  catalogo: {
    categorias: [
      {
        nome: 'Catálogo Demo',
        emoji: '👗',
        produtos: [
          { id: 'D001', nome: 'Camisola Básica', preco: 3500, stock: 20 },
          { id: 'D002', nome: 'Vestido Elegante', preco: 8000, stock: 12 },
          { id: 'D003', nome: 'Calças Jeans', preco: 5500, stock: 15 },
          { id: 'D004', nome: 'Sapatos Desportivos', preco: 7000, stock: 10 },
          { id: 'D005', nome: 'Bolsa Feminina', preco: 4500, stock: 14 },
        ],
      },
    ],

    formatarMensagem(categorias) {
      let msg = `🛍️ *Catálogo Loja Demo*\n\n`;
      for (const cat of categorias) {
        msg += `*${cat.emoji} ${cat.nome}*\n`;
        for (const p of cat.produtos) {
          const stk = p.stock > 0 ? '✅' : '❌';
          msg += `  ${stk} ${p.nome} — *${p.preco.toLocaleString('pt-PT')} Kz*\n`;
        }
        msg += '\n';
      }
      msg += `📩 Para encomendar, diga o nome do produto e o tamanho!\n_Ex: "Quero a Camisola Básica, tamanho M"_`;
      return msg;
    },
  },

  entregas: {
    faz: true,
    zonas: ['Luanda', 'Talatona', 'Viana'],
    taxa: 1500,
    prazo: '24 a 48 horas',
    msgEntrega: `📦 *Entrega disponível!*

🗺️ Zonas: Luanda, Talatona, Viana
💰 Taxa: *1.500 Kz*
⏱️ Prazo: *24 a 48 horas*`,
  },

  pagamento: {
    metodos: ['Multicaixa Express', 'Transferência Bancária', 'Pagamento na entrega'],
    msgPagamento: `💳 *Pagamento*

✅ Multicaixa Express
✅ Transferência bancária
✅ Pagamento na entrega (Luanda)`,
  },

  tamanhos: {
    disponiveis: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    guia: `📏 *Guia de tamanhos* — medidas indicativas em cm. Em dúvida, pergunte à Bia!`,
  },

  faq: [
    {
      keywords: ['horário', 'horario', 'funcionam'],
      resposta: '⏰ Atendimento *Seg–Sáb, 8h–20h* (Africa/Luanda).',
    },
  ],

  fluxoVenda: {
    confirmarPedido(pedido) {
      const total = pedido.preco + (pedido.entrega ? 1500 : 0);
      return `📋 *Resumo do Pedido*

🛍️ Produto: *${pedido.produto}*
📏 Tamanho: *${pedido.tamanho}*
💰 Produto: *${pedido.preco.toLocaleString('pt-PT')} Kz*
📦 Entrega: *${pedido.entrega ? '1.500 Kz' : 'Levantamento (grátis)'}*

*Total: ${total.toLocaleString('pt-PT')} Kz*

✅ Confirma? Responda *SIM* ou *NÃO*`;
    },

    aguardandoSupervisor: `✅ *Pedido recebido!*

A processar a sua encomenda. ⏳`,

    pedidoConfirmado(pedido) {
      return `🎉 *Pedido Confirmado!*

Obrigada pela compra na *Loja Demo*! 🙏

📦 Entrega em *24–48h*
💳 Pagamento: *${pedido.pagamento}*`;
    },

    pedidoRecusado: `Esse produto não está disponível. 😔 Escolha outro do catálogo.`,
  },

  supervisor: {
    notificacaoPedido(pedido, cliente) {
      return `🛍️ *NOVO PEDIDO — Loja Demo*

👤 Cliente: ${cliente}
📦 Produto: ${pedido.produto} (Tam. ${pedido.tamanho})
💰 Valor: ${pedido.preco.toLocaleString('pt-PT')} Kz

*#sim* / *#nao*`;
    },
  },

  llmSystemPrompt: DEMO_PROMPT,

  servicos: [],
  loadSystemPrompt: () => DEMO_PROMPT,

  validation: {
    officialPrices: [3500, 8000, 5500, 7000, 4500, 1500],
    blocks: [
      { pattern: /#(humano|pausar|retomar|status)/gi, reason: 'comando_interno' },
    ],
    maxLength: 500,
    fallbacks: {
      comando_interno: 'Em que posso ajudá-la? 😊',
      preco_inventado: 'Use apenas os preços do catálogo oficial.',
      muito_longo: 'Pode resumir? 😊',
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
    imageInPaymentStep: 'Recebemos o comprovativo. A validar com o responsável. 🙏',
    imageOutOfContext: 'Recebemos a imagem. Pode descrever por texto?',
    audioReceived: 'Pode escrever a sua dúvida? 🎤',
    botUnpaused: 'O responsável já tratou do assunto. Em que mais posso ajudar?',
    alreadyWaitingProof: 'Aguardamos o comprovativo (foto ou PDF). 📎',
    unknownInput: 'Não compreendi. Quer ver o catálogo ou fazer um pedido?',
    stockZeroAll: 'Sem stock de momento. Posso ajudar com outro artigo?',
  },
};
