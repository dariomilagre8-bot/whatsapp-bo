/**
 * [CPA] Respostas fixas Zara v2 — 34 categorias, regex, prioridade absoluta (Camada 1).
 * Tratamento formal angolano. Respostas curtas (máx 3 frases).
 */
function normalizar(texto) {
  if (typeof texto !== 'string') return '';
  return texto
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Cada categoria: id, padroes (RegExp[]), resposta (string)
const CATEGORIAS = [
  {
    id: 'saudacao',
    padroes: [/^ol[aá]$/i, /^oi$/i, /^ola$/i, /^bom\s+dia$/i, /^boa\s+tarde$/i, /^boa\s+noite$/i, /^hey$/i, /^hi$/i, /^hello$/i, /^epa$/i, /^tudo\s+bem$/i, /^e\s+pa$/i],
    resposta: 'Olá, Caríssimo(a)! 👋 Sou a Zara, Assistente da StreamZone Connect. Temos Netflix e Prime Video a preços acessíveis. O que gostaria de ver? 🎬',
  },
  {
    id: 'disponibilidade_futura',
    padroes: [/\b(quando (ter[aá]|volta|chega|tem|haver[aá])|previs[aã]o|data|prazo).*(netflix|prime|stock|dispon)/i],
    resposta: 'Ainda não temos data prevista para reposição. Posso notificá-lo(a) assim que estiver disponível! 📢 Entretanto, temos outros planos que podem interessar.',
    acao: 'manter_step',
  },
  {
    id: 'precos_netflix',
    padroes: [/^netflix$/i, /netflix\s+(pre[cç]o|quanto|custa|planos)/, /(pre[cç]o|quanto|custa|planos)\s+netflix/, /netflix\s+quanto/, /quanto\s+custa\s+netflix/],
    resposta: '🎬 *Netflix:*\n• Individual — 5.000 Kz (1 dispositivo)\n• Partilhado — 9.000 Kz (2 dispositivos)\n• Família — 13.500 Kz (3 dispositivos)\n\nQual lhe interessa? 😊',
  },
  {
    id: 'precos_prime',
    padroes: [/^prime(\s+video)?$/i, /prime\s+(pre[cç]o|quanto|custa|planos)/, /(pre[cç]o|quanto|custa|planos)\s+prime/, /amazon\s+(pre[cç]o|quanto)/, /prime\s+video\s+quanto/, /pre[cç]o\s+prime/],
    resposta: '📺 *Prime Video:*\n• Individual — 3.000 Kz (1 dispositivo)\n• Partilhado — 5.500 Kz (2 dispositivos)\n• Família — 8.000 Kz (3 dispositivos)\n\nQual lhe interessa? 😊',
  },
  {
    id: 'precos_geral',
    padroes: [/pre[cç]o/, /quanto\s+custa/, /valor/, /tabela/, /quanto\s+[eé]/, /[eé]\s+caro/, /barato/],
    resposta: 'Temos planos desde 3.000 Kz/mês! Netflix a partir de 5.000 Kz e Prime Video a partir de 3.000 Kz. Qual plataforma prefere? 😊',
  },
  {
    id: 'quero_netflix_individual',
    padroes: [/quero\s+netflix\s+individual/, /quero\s+o\s+(plano\s+)?individual\s+(da\s+)?netflix/, /netflix\s+individual\s+por\s+favor/, /netflix\s+o\s+de\s+1/, /netflix\s+simples/],
    resposta: 'Excelente! Netflix Individual — 5.000 Kz/mês (1 dispositivo). Envio os dados de pagamento? 😊',
  },
  {
    id: 'quero_netflix_partilhado',
    padroes: [/quero\s+netflix\s+partilhado/, /netflix\s+partilhado/, /netflix\s+o\s+do\s+meio/, /netflix\s+2\s+dispositivos/],
    resposta: 'Excelente! Netflix Partilhado — 9.000 Kz/mês (2 dispositivos). Envio os dados de pagamento? 😊',
  },
  {
    id: 'quero_netflix_familia',
    padroes: [/quero\s+netflix\s+fam[ií]lia/, /netflix\s+fam[ií]lia/, /netflix\s+o\s+maior/, /netflix\s+3\s+dispositivos/, /netflix\s+completo/],
    resposta: 'Excelente! Netflix Família — 13.500 Kz/mês (3 dispositivos). Envio os dados de pagamento? 😊',
  },
  {
    id: 'quero_prime_individual',
    padroes: [/quero\s+prime\s+individual/, /prime\s+individual/, /prime\s+o\s+de\s+1/, /prime\s+simples/],
    resposta: 'Excelente! Prime Video Individual — 3.000 Kz/mês (1 dispositivo). Envio os dados de pagamento? 😊',
  },
  {
    id: 'quero_prime_partilhado',
    padroes: [/quero\s+prime\s+partilhado/, /prime\s+partilhado/, /prime\s+o\s+do\s+meio/, /prime\s+2\s+dispositivos/],
    resposta: 'Excelente! Prime Video Partilhado — 5.500 Kz/mês (2 dispositivos). Envio os dados de pagamento? 😊',
  },
  {
    id: 'quero_prime_familia',
    padroes: [/quero\s+prime\s+fam[ií]lia/, /prime\s+fam[ií]lia/, /prime\s+o\s+maior/, /prime\s+3\s+dispositivos/],
    resposta: 'Excelente! Prime Video Família — 8.000 Kz/mês (3 dispositivos). Envio os dados de pagamento? 😊',
  },
  {
    id: 'quero_ambos',
    padroes: [/os\s+dois/, /ambos/, /tudo/, /as\s+duas/, /netflix\s+e\s+prime/, /prime\s+e\s+netflix/],
    resposta: 'Vamos um de cada vez. Qual prefere primeiro — Netflix ou Prime Video? 😊',
  },
  {
    id: 'seleccao_individual',
    padroes: [/^(individual|1|o\s+primeiro|o\s+simples|o\s+de\s+um)$/i, /^individual\s+por\s+favor$/i],
    resposta: 'Perfeito! Individual (1 dispositivo). Envio os dados de pagamento? 😊',
  },
  {
    id: 'seleccao_partilhado',
    padroes: [/^(partilhado|partilha|2|o\s+do\s+meio|o\s+partilhado)$/i],
    resposta: 'Perfeito! Partilhado (2 dispositivos). Envio os dados de pagamento? 😊',
  },
  {
    id: 'seleccao_familia',
    padroes: [/^(fam[ií]lia|3|o\s+maior|o\s+completo)$/i],
    resposta: 'Perfeito! Família (3 dispositivos). Envio os dados de pagamento? 😊',
  },
  {
    id: 'como_funciona',
    padroes: [/como\s+funciona/, /como\s+[eé]\s+que\s+funciona/, /como\s+compro/, /como\s+pago/, /m[eé]todo\s+de\s+pagamento/, /transfer[eê]ncia/, /pagamento\s+como/],
    resposta: 'É simples! Escolhe o plano, faz a transferência e envia o comprovativo. Recebe os dados de acesso em minutos. Qual plano deseja? 😊',
  },
  {
    id: 'dispositivos',
    padroes: [/quantos\s+dispositivos/, /dispositivos/, /quantos\s+aparelhos/, /posso\s+usar\s+em/, /partilhar\s+com/, /usar\s+no\s+computador/, /usar\s+na\s+tv/, /usar\s+no\s+telefone/, /funciona\s+em\s+tv/, /smart\s+tv/],
    resposta: 'Depende do plano: Individual (1 dispositivo), Partilhado (2), Família (3). Qual lhe interessa? 😊',
  },
  {
    id: 'pagamento',
    padroes: [/como\s+pago/, /multicaixa/, /iban/, /transfer[eê]ncia\s+banc[aá]ria/, /dados\s+para\s+pagamento/, /onde\s+fa[cç]o\s+o\s+pagamento/],
    resposta: 'Pode pagar por Multicaixa Express ou transferência bancária. Após escolher o plano, envio os dados e o comprovativo é enviado por aqui. 😊',
  },
  {
    id: 'codigo_verificacao',
    padroes: [/\bc[oó]dig[oa]\b/, /c[oó]dig[oa]\s+(de\s+)?verifica[cç][aã]o/, /c[oó]dig[oa]\s+netflix/, /c[oó]dig[oa]\s+email/, /otp/, /verifica[cç][aã]o/, /pede\s+c[oó]dig[oa]/, /mandar\s+c[oó]dig[oa]/, /\b\d{4,8}\s*(c[oó]dig[oa]|verifica)/i],
    resposta: 'É normal na primeira vez ou em dispositivo novo. Envie-me o código que o responsável resolve. Um momento! 🙏',
  },
  {
    id: 'senha_errada',
    padroes: [/senha\s+(mudou|errada|n[aã]o\s+funciona)/, /password\s+errada/, /mudaram\s+a\s+senha/, /nova\s+senha/, /palavra[- ]?passe\s+errada/],
    resposta: 'Peço desculpa pelo incómodo! Vou verificar e enviar-lhe a senha correcta. Um momento, por favor! 🔑',
  },
  {
    id: 'conta_bloqueada',
    padroes: [/conta\s+bloqueada/, /perfil\s+bloqueado/, /bloqueado/, /n[aã]o\s+consigo\s+entrar/, /acesso\s+negado/],
    resposta: 'Vou verificar com o responsável e resolver o mais breve possível. Um momento! 🔧',
  },
  {
    id: 'perfil_nao_aparece',
    padroes: [/perfil\s+n[aã]o\s+aparece/, /n[aã]o\s+vejo\s+o\s+perfil/, /perfil\s+sumiu/, /saiu\s+o\s+perfil/],
    resposta: 'Tente sair e entrar na app. Se persistir, diga-me a plataforma e o email da conta que resolvo. 😊',
  },
  {
    id: 'renovar',
    padroes: [/renovar/, /renova[cç][aã]o/, /expirou/, /acabou/, /venceu/, /plano\s+acabou/, /quero\s+renovar/],
    resposta: 'Para renovar é simples! Faça o pagamento do mesmo valor e envie o comprovativo. Renovamos na hora. Gostaria de renovar? 🔄',
  },
  {
    id: 'cancelar',
    padroes: [/quero\s+cancelar/, /cancelar\s+plano/, /n[aã]o\s+quero\s+mais/, /quero\s+sair/, /desistir/],
    resposta: 'Lamento ouvir isso. Posso saber o motivo? Se preferir, posso passá-lo(a) ao responsável para tratar. 🙏',
  },
  {
    id: 'reembolso',
    padroes: [/reembolso/, /dinheiro\s+de\s+volta/, /devolver\s+dinheiro/, /quero\s+devolver/, /quero\s+o\s+meu\s+dinheiro/],
    resposta: 'Percebo. Antes de avançar, posso saber o que aconteceu? Gostaria de tentar resolver o problema primeiro. 🙏',
  },
  {
    id: 'confianca',
    padroes: [/[eé]\s+confi[aá]vel/, /seguro/, /funciona\s+mesmo/, /scam/, /verdade/, /[eé]\s+real/, /fraude/, /burla/, /golpe/],
    resposta: 'Compreendo! A StreamZone tem clientes satisfeitos. Pode visitar streamzone-frontend.vercel.app. 🤝',
  },
  {
    id: 'site',
    padroes: [/site/, /link/, /website/, /onde\s+compro/, /comprar\s+online/],
    resposta: 'Pode ver o nosso site: streamzone-frontend.vercel.app. Ou faço tudo por aqui. O que prefere? 🌐',
  },
  {
    id: 'falar_humano',
    padroes: [/humano/, /pessoa/, /atendente/, /falar\s+com\s+algu[eé]m/, /quero\s+uma\s+pessoa/, /respons[aá]vel/, /gerente/, /chefe/, /falar\s+com\s+(o\s+)?dono/],
    resposta: 'Vou passá-lo(a) para o responsável. Ele responde em breve! 🙂',
  },
  {
    id: 'despedida',
    padroes: [/obrigad[oa]/, /tchau/, /xau/, /adeus/, /valeu/, /at[eé]\s+logo/, /fui/, /at[eé]\s+[aà]\s+pr[oó]xima/],
    resposta: 'De nada! Bom filme e boa série. Se precisar, estou aqui. 🍿',
  },
  {
    id: 'sim_generico',
    padroes: [/^(sim|ok|pode\s+ser|bora|vamos|aceito|quero)$/i, /^sim\s+por\s+favor$/i],
    resposta: 'Perfeito! Em que posso ajudar agora? 😊',
  },
  {
    id: 'nao_generico',
    padroes: [/^(n[aã]o|depois|mais\s+tarde|agora\s+n[aã]o)$/i],
    resposta: 'Sem problema! Quando quiser, estou aqui. 😊',
  },
  {
    id: 'download_offline',
    padroes: [/descarregar/, /offline/, /sem\s+internet/, /ver\s+sem\s+internet/, /download/],
    resposta: 'Sim! Pode descarregar conteúdo na app para ver offline. 😊',
  },
  {
    id: 'tempo_activacao',
    padroes: [/quanto\s+tempo/, /quando\s+recebo/, /quando\s+ativam/, /prazo\s+de\s+entrega/, /demora\s+quanto/],
    resposta: 'Assim que confirmarmos o pagamento, entregamos o acesso. Normalmente em poucos minutos. 😊',
  },
  {
    id: 'reserva',
    padroes: [/guardar/, /reservar/, /separar/, /segurar/, /guardar\s+perfil/, /reservar\s+perfil/, /guardar\s+pra\s+mim/, /pode\s+guardar/],
    resposta: 'Posso reservar o seu perfil por 24 horas enquanto faz o pagamento. Após esse prazo, fica disponível para outros. Gostaria que reserve? 📋',
  },
  {
    id: 'paguei_sem_resposta',
    padroes: [/j[aá]\s+paguei/, /paguei\s+e\s+nada/, /paguei\s+mas/, /mandei\s+comprovativo/, /comprovativo\s+enviado/, /j[aá]\s+enviei/, /quando\s+recebo\s+os\s+dados/],
    resposta: 'Peço desculpa pela demora! O responsável está a verificar o seu pagamento. Um momento, por favor! 🙏',
  },
  {
    id: 'quero_comprar',
    padroes: [/quero\s+comprar/, /quero\s+assinar/, /vou\s+levar/, /quero\s+um\s+plano/, /quero\s+netflix(?!\s+individual|\s+partilhado|\s+familia)/, /quero\s+prime(?!\s+individual|\s+partilhado|\s+familia)/],
    resposta: 'Excelente! Temos Netflix e Prime Video. Qual plano prefere? (Individual, Partilhado ou Família) 😊',
  },
  {
    id: 'problema_conta',
    padroes: [/n[aã]o\s+funciona/, /n[aã]o\s+consigo\s+entrar/, /n[aã]o\s+abre/, /erro/, /problema/, /bloqueado/, /n[aã]o\s+carrega/],
    resposta: 'Vou resolver isso! Qual plataforma (Netflix ou Prime) e qual o email da conta? Verifico e corrijo. 🔧',
  },
];

// Resposta quando recebe imagem no step aguardando_comprovativo
const RESPOSTA_COMPROVATIVO_RECEBIDO =
  'Recebi o seu documento/imagem! 📄 Vou encaminhar para o responsável validar o pagamento. O seu perfil será entregue em breve. 😊';

// Resposta quando recebe imagem fora do contexto de pagamento
const RESPOSTA_IMAGEM_FORA_CONTEXTO =
  'Recebi a sua imagem! Infelizmente não consigo visualizar imagens directamente. Pode dizer-me por texto do que se trata? Se for comprovativo de pagamento, reclamação ou ajuda específica, basta escrever. 😊';

// Texto de fecho (referência — o fecho real é mensagemFechoConsolidada em funil-zara.js)
const RESPOSTA_FECHO_IBAN =
  'Excelente! Para finalizar: faça a transferência (IBAN: 0040.0000.7685.3192.1018.3, Multicaixa: 946014060, Titular: Braulio Manuel) e envie o comprovativo por aqui. ✅';

const RESPOSTA_SEM_STOCK_NETFLIX_CROSSSELL =
  'De momento Netflix está esgotado. 😔 Temos *Prime Video* disponível a partir de 3.000 Kz/mês! Gostaria de ver os planos?';

const CATEGORIAS_ESCALAR_URGENTE = ['codigo_verificacao', 'senha_errada', 'paguei_sem_resposta'];
const CATEGORIAS_ESCALAR_NORMAL = ['falar_humano', 'reembolso', 'reserva'];
const CATEGORIAS_PAUSAR_BOT = ['codigo_verificacao', 'senha_errada', 'falar_humano'];

/**
 * Verifica se a mensagem corresponde a alguma resposta fixa.
 * Usa o primeiro match por ordem de categoria (prioridade).
 * Se precos_netflix e stock Netflix <= 0 (ou precos_prime e stock Prime <= 0), anula o match
 * para o fluxo cair na IA, que avisa sobre stock esgotado.
 */
function verificarRespostaFixa(mensagem, netflixSlots = 1, primeSlots = 1) {
  const norm = normalizar(mensagem);
  if (!norm) return { match: false };

  for (const cat of CATEGORIAS) {
    for (const re of cat.padroes) {
      const regex = new RegExp(re.source, re.flags || 'i');
      if (regex.test(norm)) {
        if (cat.id === 'precos_netflix' && netflixSlots <= 0) return { match: false };
        if (cat.id === 'precos_prime' && primeSlots <= 0) return { match: false };
        return { match: true, categoria: cat.id, resposta: cat.resposta };
      }
    }
  }
  return { match: false };
}

function getCategoriaRespostaFixa(mensagem) {
  const r = verificarRespostaFixa(mensagem);
  return r.match ? r.categoria : null;
}

/**
 * Se a intenção for comprar mas faltar plano no state, devolve resposta de preços.
 */
function getRespostaPrecosSeSemPlano(mensagem, state) {
  const r = verificarRespostaFixa(mensagem);
  if (!r.match) return null;
  const temPlano = !!(state && (state.plano || (state.cart && state.cart[0] && state.cart[0].plan)));
  if (temPlano) return null;
  const norm = normalizar(mensagem);
  const catPrecos = norm.includes('netflix') ? 'precos_netflix' : norm.includes('prime') || norm.includes('amazon') ? 'precos_prime' : 'precos_geral';
  const cat = CATEGORIAS.find(c => c.id === catPrecos);
  return cat ? { categoria: cat.id, resposta: cat.resposta } : null;
}

module.exports = {
  CATEGORIAS,
  RESPOSTA_COMPROVATIVO_RECEBIDO,
  RESPOSTA_IMAGEM_FORA_CONTEXTO,
  RESPOSTA_FECHO_IBAN,
  RESPOSTA_SEM_STOCK_NETFLIX_CROSSSELL,
  CATEGORIAS_ESCALAR_URGENTE,
  CATEGORIAS_ESCALAR_NORMAL,
  CATEGORIAS_PAUSAR_BOT,
  verificarRespostaFixa,
  getCategoriaRespostaFixa,
  getRespostaPrecosSeSemPlano,
  normalizar,
};
