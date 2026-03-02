// Respostas fixas da Zara — triggers por categoria (streaming)
// Estrutura inspirada em objeccoes.js da Luna (Palanca AI)

const CATEGORIAS = [
  {
    id: 'saudacao',
    triggers: ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hi', 'hello', 'epa', 'tudo bem'],
    resposta: 'Olá! 👋 Sou a Zara da StreamZone.\nTemos Netflix e Prime Video a preços acessíveis.\nO que gostavas de ver? 🎬',
  },
  {
    id: 'precos_netflix',
    triggers: ['netflix', 'preço netflix', 'quanto custa netflix', 'netflix preço', 'planos netflix'],
    resposta: '🎬 Netflix na StreamZone:\n\n• Perfil Individual — 5.000 Kz/mês\n• Perfil Partilhado — 9.000 Kz/mês\n• Conta Família — 13.500 Kz/mês\n\nQual te interessa?',
  },
  {
    id: 'precos_prime',
    triggers: ['prime', 'prime video', 'amazon', 'preço prime', 'quanto custa prime', 'planos prime'],
    resposta: '📺 Prime Video na StreamZone:\n\n• Perfil Individual — 3.000 Kz/mês\n• Perfil Partilhado — 5.500 Kz/mês\n• Conta Família — 8.000 Kz/mês\n\nQual te interessa?',
  },
  {
    id: 'precos_geral',
    triggers: ['preço', 'preco', 'quanto custa', 'valor', 'tabela', 'quanto é', 'é caro', 'barato'],
    resposta: 'Temos planos desde 3.000 Kz/mês! 💡\nNetflix a partir de 5.000 Kz e Prime Video a partir de 3.000 Kz.\nQual plataforma preferes?',
  },
  {
    id: 'como_funciona',
    triggers: ['como funciona', 'como é que funciona', 'como compro', 'como faço', 'como pago', 'método de pagamento', 'transferência', 'pagamento'],
    resposta: 'É muito simples! 😊\n1. Escolhes o plano\n2. Fazes transferência e mandas o comprovativo\n3. Recebes os dados de acesso em minutos\nQual plano queres?',
  },
  {
    id: 'confianca',
    triggers: ['é confiável', 'confiavel', 'seguro', 'funciona mesmo', 'scam', 'verdade', 'é real', 'roubo'],
    resposta: 'Percebo a dúvida! 🤝\nA StreamZone já tem clientes satisfeitos em Angola.\nTodas as contas são verificadas e tens suporte directo comigo.\nQueres experimentar?',
  },
  {
    id: 'renovar',
    triggers: ['renovar', 'renovação', 'renovacao', 'expirou', 'acabou', 'venceu', 'plano acabou'],
    resposta: 'Para renovar é simples! 🔄\nFaz o pagamento do mesmo valor e manda-me o comprovativo.\nRenovo na hora e continuas a ver sem parar.\nQueres renovar agora?',
  },
  {
    id: 'problema_conta',
    triggers: ['não funciona', 'nao funciona', 'não consigo entrar', 'nao consigo entrar', 'senha errada', 'não abre', 'erro', 'problema', 'bloqueado'],
    resposta: 'Vou resolver isso já! 🔧\nDiz-me: qual plataforma (Netflix ou Prime) e qual o email da conta?\nVerifico e corrijo em minutos.',
  },
  {
    id: 'quero_comprar',
    triggers: ['quero comprar', 'quero', 'vou levar', 'pode ser', 'aceito', 'bora', 'vamos', 'manda', 'quero um', 'quero netflix', 'quero prime'],
    resposta: 'Excelente escolha! 🎉\nPara finalizar, preciso de:\n1. O teu nome completo\n2. O plano que escolheste\n3. Comprovativo de pagamento\nPodes enviar por aqui mesmo!',
  },
  {
    id: 'despedida',
    triggers: ['obrigado', 'obrigada', 'tchau', 'xau', 'adeus', 'valeu', 'brigado', 'até logo', 'fui'],
    resposta: 'De nada! 😊 Bom filme e boa série!\nSe precisares de alguma coisa, estou aqui. 🍿',
  },
  {
    id: 'site',
    triggers: ['site', 'link', 'website', 'onde compro', 'comprar online'],
    resposta: 'Podes comprar directamente no nosso site! 🌐\nhttps://streamzone-frontend.vercel.app\nOu se preferires, faço tudo por aqui mesmo. O que preferes?',
  },
  {
    id: 'falar_humano',
    triggers: ['humano', 'HUMANO', 'pessoa', 'atendente', 'falar com alguém', 'falar com alguem', 'quero uma pessoa'],
    resposta: 'Vou passar-te para o responsável. Ele responde em breve! 🙂',
  },
];

function normalizar(texto) {
  if (typeof texto !== 'string') return '';
  return texto
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Verifica se a mensagem corresponde a algum trigger de resposta fixa.
 * @param {string} mensagem - Texto da mensagem do utilizador
 * @returns {{ match: boolean, categoria?: string, resposta?: string }}
 */
function verificarRespostaFixa(mensagem) {
  const norm = normalizar(mensagem);
  if (!norm) return { match: false };

  for (const cat of CATEGORIAS) {
    for (const t of cat.triggers) {
      if (norm.includes(normalizar(t))) {
        return { match: true, categoria: cat.id, resposta: cat.resposta };
      }
    }
  }
  return { match: false };
}

/**
 * Obtém o id da categoria da resposta fixa que fez match (ou null).
 * @param {string} mensagem - Texto da mensagem do utilizador
 * @returns {string|null}
 */
function getCategoriaRespostaFixa(mensagem) {
  const r = verificarRespostaFixa(mensagem);
  return r.match ? r.categoria : null;
}

module.exports = {
  CATEGORIAS,
  verificarRespostaFixa,
  getCategoriaRespostaFixa,
};
