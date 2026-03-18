'use strict';

// ============================================================
// PALANCA AUTOMAÇÕES — Bot Demo: Moda Luanda Store
// Nicho: Loja de Roupa Online
// Número WPP: 244958765478
// Supervisor: 244941713216 (Don — teste)
// Plano: Profissional (mostra TUDO ao lead)
// ============================================================

module.exports = {
  // ── IDENTIDADE ─────────────────────────────────────────────
  slug: 'demo-moda',
  nome: 'Moda Luanda Store',
  numero: '244958765478',
  supervisorNumbers: ['244941713216'],
  plano: 'profissional',
  ativo: true,

  // ── SAUDAÇÃO ───────────────────────────────────────────────
  saudacao: `Olá! 👗 Bem-vindo/a à *Moda Luanda Store*!

Sou a *Zara*, a sua assistente virtual. Posso ajudar com:

👗 Ver o catálogo
💰 Consultar preços
🛍️ Fazer um pedido
📦 Informações de entrega
📏 Guia de tamanhos

O que posso fazer por si?`,

  // ── HORÁRIO ────────────────────────────────────────────────
  horario: {
    inicio: 8,
    fim: 20,
    diasSemana: [1, 2, 3, 4, 5, 6], // Seg a Sáb
    fusoHorario: 'Africa/Luanda',
    msgFora: `Olá! 😊 Neste momento estamos fora do horário de atendimento.

⏰ Funcionamos *Seg–Sáb, 8h–20h*.
Assim que reabrirmos, respondemos de imediato!

Deixe a sua mensagem que retornamos em breve. 🙏`,
  },

  // ── REGEX TRIGGERS ─────────────────────────────────────────
  triggers: {
    catalogo: /\b(catálogo|catalogo|produtos?|ver (produtos?|roupa|peças?)|o que têm|o que vendem|lista)\b/i,
    precos: /\b(preço|precio|quanto (custa|é|vale)|valor|kz)\b/i,
    pedido: /\b(quero|comprar|encomendar|pedir|order)\b/i,
    entrega: /\b(entrega?|entregar|frete|portes?|envio)\b/i,
    tamanhos: /\b(tamanho|medida|guia|numeração|talla|size)\b/i,
    pagamento: /\b(pagar|pagamento|multicaixa|transferência|forma de pag)\b/i,
    localizacao: /\b(onde|loja|endereço|localiz|morada|fica)\b/i,
    trocas: /\b(troca|devol|retorno|troca)\b/i,
    promocao: /\b(promoç|desconto|oferta|sale|saldo|liquidação)\b/i,
    saudacao: /^(olá|ola|oi|bom dia|boa tarde|boa noite|hey|hi|hello)\b/i,
  },

  // ── CATÁLOGO ───────────────────────────────────────────────
  catalogo: {
    categorias: [
      {
        nome: 'Vestidos',
        emoji: '👗',
        produtos: [
          { id: 'V001', nome: 'Vestido Casual Floral', preco: 8500, stock: 12 },
          { id: 'V002', nome: 'Vestido Elegante Preto', preco: 14500, stock: 5 },
          { id: 'V003', nome: 'Vestido Africano Kitenge', preco: 11000, stock: 8 },
        ],
      },
      {
        nome: 'Calças & Jeans',
        emoji: '👖',
        produtos: [
          { id: 'C001', nome: 'Calça Jeans Slim', preco: 6000, stock: 20 },
          { id: 'C002', nome: 'Calça Social Feminina', preco: 7500, stock: 14 },
          { id: 'C003', nome: 'Shorts Casual', preco: 4500, stock: 18 },
        ],
      },
      {
        nome: 'Tops & Blusas',
        emoji: '👚',
        produtos: [
          { id: 'T001', nome: 'Blusa Linho Premium', preco: 5500, stock: 22 },
          { id: 'T002', nome: 'Top Cropped Verão', preco: 3500, stock: 30 },
          { id: 'T003', nome: 'Camisa Social Feminina', preco: 6500, stock: 16 },
        ],
      },
      {
        nome: 'Conjuntos',
        emoji: '✨',
        produtos: [
          { id: 'K001', nome: 'Conjunto Africano Completo', preco: 18000, stock: 6 },
          { id: 'K002', nome: 'Conjunto Desportivo', preco: 9500, stock: 10 },
        ],
      },
    ],

    formatarMensagem(categorias) {
      let msg = `🛍️ *Catálogo Moda Luanda Store*\n\n`;
      for (const cat of categorias) {
        msg += `*${cat.emoji} ${cat.nome}*\n`;
        for (const p of cat.produtos) {
          const stk = p.stock > 0 ? '✅' : '❌';
          msg += `  ${stk} ${p.nome} — *${p.preco.toLocaleString('pt-PT')} Kz*\n`;
        }
        msg += '\n';
      }
      msg += `📩 Para encomendar, diga o nome do produto e o tamanho!\n_Ex: "Quero o Vestido Casual Floral, tamanho M"_`;
      return msg;
    },
  },

  // ── ENTREGAS ───────────────────────────────────────────────
  entregas: {
    faz: true,
    zonas: ['Luanda', 'Talatona', 'Viana', 'Cacuaco', 'Kilamba'],
    taxa: 1500,
    prazo: '24 a 48 horas',
    msgEntrega: `📦 *Entrega disponível!*

🗺️ Zonas: Luanda, Talatona, Viana, Cacuaco, Kilamba
💰 Taxa de entrega: *1.500 Kz*
⏱️ Prazo: *24 a 48 horas após confirmação*

🏪 Também pode levantar na loja:
📍 *Talatona, Rua das Mangueiras, nº 47*`,
  },

  // ── PAGAMENTO ──────────────────────────────────────────────
  pagamento: {
    metodos: ['Multicaixa Express', 'Transferência Bancária', 'Pagamento na entrega'],
    msgPagamento: `💳 *Métodos de pagamento aceites*

✅ Multicaixa Express
✅ Transferência Bancária (BAI / BFA)
✅ Pagamento na entrega (apenas Luanda)

Após confirmação do pagamento, o pedido é processado imediatamente! 🚀`,
  },

  // ── TAMANHOS ───────────────────────────────────────────────
  tamanhos: {
    disponiveis: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    guia: `📏 *Guia de Tamanhos*

| Tamanho | Busto | Cintura | Quadril |
|---------|-------|---------|---------|
| XS      | 78–82 | 60–64   | 84–88   |
| S       | 82–86 | 64–68   | 88–92   |
| M       | 86–90 | 68–72   | 92–96   |
| L       | 90–94 | 72–76   | 96–100  |
| XL      | 94–98 | 76–80   | 100–104 |
| XXL     | 98+   | 80+     | 104+    |

_Medidas em cm. Em dúvida? Envie as suas medidas!_ 😊`,
  },

  // ── FAQ ────────────────────────────────────────────────────
  faq: [
    {
      keywords: ['troca', 'devolver', 'devolucao', 'trocar', 'retorno'],
      resposta: `🔄 *Política de Trocas*

Aceitamos trocas em *7 dias* após recepção:
✅ Produto sem uso
✅ Com etiqueta original
✅ Na embalagem original

Para iniciar, envie foto do produto + motivo. 📸`,
    },
    {
      keywords: ['promoção', 'desconto', 'oferta', 'sale', 'saldo', 'liquidação'],
      resposta: `🎉 *Promoções desta semana!*

🔥 Vestidos: *10% desconto* na compra de 2+ peças
🔥 Conjuntos Africanos: *frete grátis* para Luanda

📲 Siga @modaluandastore no Instagram para promoções diárias!`,
    },
    {
      keywords: ['onde', 'loja', 'endereço', 'localização', 'morada', 'fica'],
      resposta: `📍 *Encontre-nos!*

🏪 Loja física: *Talatona, Rua das Mangueiras, nº 47*
🕐 Horário: Seg–Sáb, 8h–20h
📱 WhatsApp: este número
📸 Instagram: @modaluandastore`,
    },
  ],

  // ── FLUXO DE VENDA ─────────────────────────────────────────
  fluxoVenda: {
    confirmarPedido(pedido) {
      const total = pedido.preco + (pedido.entrega ? 1500 : 0);
      return `📋 *Resumo do Pedido*

🛍️ Produto: *${pedido.produto}*
📏 Tamanho: *${pedido.tamanho}*
💰 Produto: *${pedido.preco.toLocaleString('pt-PT')} Kz*
📦 Entrega: *${pedido.entrega ? '1.500 Kz' : 'Levantamento (grátis)'}*
💳 Pagamento: *${pedido.pagamento}*

*Total: ${total.toLocaleString('pt-PT')} Kz*

✅ Confirma o pedido? Responda *SIM* ou *NÃO*`;
    },

    aguardandoSupervisor: `✅ *Pedido recebido!*

Estou a confirmar o stock e a processar a sua encomenda.
⏳ Em instantes recebe a confirmação final!

_Qualquer dúvida, estamos aqui_ 😊`,

    pedidoConfirmado(pedido) {
      return `🎉 *Pedido Confirmado!*

Obrigada pela compra na *Moda Luanda Store*! 🙏

📦 Preparamos e entregamos em *24–48h*
💳 Aguardamos o pagamento via *${pedido.pagamento}*

_Vista-se com estilo! — Moda Luanda Store_`;
    },

    pedidoRecusado: `Desculpe, esse produto não está disponível neste momento. 😔

Por favor escolha outro do catálogo ou pergunte por alternativas similares!`,
  },

  // ── NOTIFICAÇÃO SUPERVISOR ─────────────────────────────────
  supervisor: {
    notificacaoPedido(pedido, cliente) {
      return `🛍️ *NOVO PEDIDO — Moda Luanda Store*

👤 Cliente: ${cliente}
📦 Produto: ${pedido.produto} (Tam. ${pedido.tamanho})
💰 Valor: ${pedido.preco.toLocaleString('pt-PT')} Kz
🚚 Entrega: ${pedido.entrega ? `Sim (${pedido.zona})` : 'Levantamento na loja'}
💳 Pagamento: ${pedido.pagamento}

Responda *#sim* para confirmar ou *#nao* para recusar.`;
    },
  },

  // ── PROMPT GEMINI (fallback LLM) ───────────────────────────
  llmSystemPrompt: `És a Zara, assistente virtual da Moda Luanda Store — loja de roupa online em Luanda, Angola.

Personalidade: simpática, profissional, eficiente. Fala em português angolano formal mas acessível.

Regras absolutas:
- NUNCA revelar preços além dos do catálogo oficial
- NUNCA prometer entregas fora das zonas definidas
- NUNCA revelar comandos internos do sistema (#sim, #nao, etc.)
- Para pedidos → sempre recolher: produto, tamanho, zona de entrega, método de pagamento
- Dúvidas complexas → escalar para supervisor humano

Catálogo resumido: Vestidos (8.500–14.500 Kz), Calças (4.500–7.500 Kz), Tops (3.500–6.500 Kz), Conjuntos (9.500–18.000 Kz).
Entrega: 1.500 Kz, 24–48h, Luanda + subúrbios.`,
};
