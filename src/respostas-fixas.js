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
    resposta: '🎬 Netflix na StreamZone:\n\n• Individual — 5.000 Kz/mês (1 dispositivo)\n• Partilhado — 9.000 Kz/mês (2 dispositivos)\n• Família — 13.500 Kz/mês (3 dispositivos)\n\nQual te interessa?',
  },
  {
    id: 'precos_prime',
    triggers: ['prime', 'prime video', 'amazon', 'preço prime', 'quanto custa prime', 'planos prime'],
    resposta: '📺 Prime Video na StreamZone:\n\n• Individual — 3.000 Kz/mês (1 dispositivo)\n• Partilhado — 5.500 Kz/mês (2 dispositivos)\n• Família — 8.000 Kz/mês (3 dispositivos)\n\nQual te interessa?',
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
    id: 'dispositivos',
    triggers: ['quantos dispositivos', 'dispositivos', 'quantos aparelhos', 'posso usar em', 'partilhar com', 'dividir', 'usar no computador', 'usar na tv', 'usar no telefone', 'dois dispositivos', 'três dispositivos', 'mais dispositivos'],
    resposta: 'Depende do plano! 📱\n\n• Individual — 1 dispositivo\n• Partilhado — 2 dispositivos\n• Família — 3 dispositivos\n\nNão é permitido usar em mais do que os incluídos.\nQual plano te interessa?',
  },
  {
    id: 'codigo_verificacao',
    triggers: ['código', 'codigo', 'código de verificação', 'codigo verificação', 'código netflix', 'codigo netflix', 'código email', 'codigo email', 'otp', 'verificação', 'verificacao', 'pede código', 'pede codigo', 'mandar código', 'mandar codigo', 'código prime', 'code', 'pin netflix'],
    resposta: 'Isso acontece quando entras num dispositivo novo — é normal! 😊\nVou pedir o código ao responsável. Dá-me 2 minutos!',
  },
  {
    id: 'confianca',
    triggers: ['é confiável', 'confiavel', 'seguro', 'funciona mesmo', 'scam', 'verdade', 'é real', 'roubo', 'fraude', 'burla'],
    resposta: 'Percebo a dúvida! 🤝\nA StreamZone já serve centenas de clientes em Angola.\nTodas as contas são verificadas e tens suporte directo comigo.\nQueres experimentar?',
  },
  {
    id: 'renovar',
    triggers: ['renovar', 'renovação', 'renovacao', 'expirou', 'acabou', 'venceu', 'plano acabou', 'renovar plano'],
    resposta: 'Para renovar é simples! 🔄\nFaz o pagamento do mesmo valor e manda-me o comprovativo.\nRenovo na hora e continuas a ver sem parar.\nQueres renovar agora?',
  },
  {
    id: 'problema_conta',
    triggers: ['não funciona', 'nao funciona', 'não consigo entrar', 'nao consigo entrar', 'não abre', 'erro', 'problema', 'bloqueado', 'conta bloqueada', 'ecrã preto', 'não carrega', 'nao carrega'],
    resposta: 'Vou resolver isso já! 🔧\nDiz-me: qual plataforma (Netflix ou Prime) e qual o email da conta?\nVerifico e corrijo em minutos.',
  },
  {
    id: 'senha_errada',
    triggers: ['senha mudou', 'senha errada', 'senha não funciona', 'senha nao funciona', 'password errada', 'password mudou', 'mudaram a senha', 'nova senha'],
    resposta: 'Peço desculpa pelo incómodo! 🔑\nVou verificar e enviar-te a senha correcta.\nDá-me um momento!',
  },
  {
    id: 'reembolso',
    triggers: ['reembolso', 'dinheiro de volta', 'devolver dinheiro', 'quero devolver', 'quero o meu dinheiro'],
    resposta: 'Percebo. Antes de avançar com isso, posso saber o que aconteceu?\nQuero tentar resolver o problema primeiro. 🙏',
  },
  {
    id: 'paguei_sem_resposta',
    triggers: ['já paguei', 'ja paguei', 'paguei e nada', 'paguei mas', 'mandei comprovativo', 'comprovativo enviado', 'já enviei', 'ja enviei', 'quando recebo'],
    resposta: 'Peço desculpa pela demora! 🙏\nVou verificar o teu pagamento agora mesmo.\nDá-me 2 minutos!',
  },
  {
    id: 'quero_comprar',
    triggers: ['quero comprar', 'quero', 'vou levar', 'pode ser', 'aceito', 'bora', 'vamos', 'manda', 'quero um', 'quero netflix', 'quero prime', 'quero assinar'],
    resposta: 'Excelente escolha! 🎉\nPara finalizar:\n1. Diz-me o plano que escolheste\n2. Faz a transferência\n3. Manda o comprovativo aqui\nQual plano queres?',
  },
  {
    id: 'falar_humano',
    triggers: ['humano', 'HUMANO', 'pessoa', 'atendente', 'falar com alguém', 'falar com alguem', 'quero uma pessoa', 'responsável', 'responsavel', 'falar com o dono', 'gerente', 'chefe'],
    resposta: 'Vou passar-te para o responsável. Ele responde em breve! 🙂',
  },
  {
    id: 'site',
    triggers: ['site', 'link', 'website', 'onde compro', 'comprar online'],
    resposta: 'Podes comprar no nosso site! 🌐\nhttps://streamzone-frontend.vercel.app\nOu faço tudo por aqui. O que preferes?',
  },
  {
    id: 'despedida',
    triggers: ['obrigado', 'obrigada', 'tchau', 'xau', 'adeus', 'valeu', 'brigado', 'até logo', 'fui'],
    resposta: 'De nada! 😊 Bom filme e boa série!\nSe precisares, estou aqui. 🍿',
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
 * Usa o trigger mais longo que fizer match (evita "oi" em "dois", "netflix" em "código netflix").
 * @param {string} mensagem - Texto da mensagem do utilizador
 * @returns {{ match: boolean, categoria?: string, resposta?: string }}
 */
function verificarRespostaFixa(mensagem) {
  const norm = normalizar(mensagem);
  if (!norm) return { match: false };

  let best = { length: 0, categoria: null, resposta: null };
  for (const cat of CATEGORIAS) {
    for (const t of cat.triggers) {
      const tNorm = normalizar(t);
      if (tNorm.length > best.length && norm.includes(tNorm)) {
        best = { length: tNorm.length, categoria: cat.id, resposta: cat.resposta };
      }
    }
  }
  if (best.categoria) {
    return { match: true, categoria: best.categoria, resposta: best.resposta };
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

/** Categorias que disparam escalação automática ao supervisor */
const CATEGORIAS_ESCALAR_URGENTE = ['codigo_verificacao', 'senha_errada', 'paguei_sem_resposta'];
const CATEGORIAS_ESCALAR_NORMAL = ['falar_humano', 'reembolso'];
const CATEGORIAS_PAUSAR_BOT = ['codigo_verificacao', 'senha_errada', 'falar_humano'];

module.exports = {
  CATEGORIAS,
  CATEGORIAS_ESCALAR_URGENTE,
  CATEGORIAS_ESCALAR_NORMAL,
  CATEGORIAS_PAUSAR_BOT,
  verificarRespostaFixa,
  getCategoriaRespostaFixa,
};
