// engine/outreach/messageTemplates.js — templates por nicho (PT-AO casual, sem markdown WhatsApp)

const NICHOS = {
  ecommerce: {
    A: 'Bom dia {nome_pessoa}, sou o Don da Palanca Automações. Reparei que o WhatsApp da {nome_empresa} demora a responder aos clientes. Temos um sistema que responde em 2 segundos, 24/7. Posso mostrar como funciona em 90 segundos?',
    B: 'Hey {nome_pessoa}, gravei um vídeo rápido a mostrar como uma loja online em Luanda recuperou 20% das vendas perdidas com atendimento automático no WhatsApp. Quer ver? São 90 segundos.',
    C: '{nome_pessoa}, pergunta rápida — vocês têm alguém a responder o WhatsApp da {nome_empresa} durante a noite e fins de semana? Pergunto porque temos clientes no mesmo nicho que resolveram isto.',
  },
  restauracao: {
    A: 'Bom dia {nome_pessoa}, sou o Don da Palanca Automações. Vi que a {nome_empresa} recebe muitas mensagens no WhatsApp para reservas e menu. Temos um bot que trata disso automaticamente, 24/7. Posso mostrar em 90 segundos?',
    B: 'Hey {nome_pessoa}, implementámos um sistema para restaurantes em Luanda que responde automaticamente a perguntas sobre menu, reservas e horários. Os clientes adoram. Quer ver como funciona?',
    C: '{nome_pessoa}, pergunta rápida — quantas mensagens no WhatsApp a {nome_empresa} recebe por dia? Pergunto porque temos soluções para restaurantes que eliminam 80% das perguntas repetitivas.',
  },
  beleza: {
    A: 'Bom dia {nome_pessoa}, sou o Don da Palanca Automações. Vi que a {nome_empresa} tem agenda cheia. Temos um bot WhatsApp que faz marcações automáticas 24/7. Posso mostrar em 90 segundos?',
    B: 'Hey {nome_pessoa}, salões em Luanda que usam o nosso bot reduziram 70% das marcações por telefone. As clientes marcam sozinhas no WhatsApp, a qualquer hora. Quer ver?',
    C: '{nome_pessoa}, pergunta rápida — as vossas clientes conseguem marcar pelo WhatsApp fora do horário? Temos soluções que resolvem isso.',
  },
  generico: {
    A: 'Bom dia {nome_pessoa}, sou o Don da Palanca Automações. A {nome_empresa} trabalha com {servico_principal} e o WhatsApp costuma ser o primeiro contacto. Temos um sistema que responde em segundos, 24/7. Posso mostrar em 90 segundos?',
    B: 'Hey {nome_pessoa}, tenho um exemplo curto de como negócios em Luanda com {servico_principal} ganham tempo no WhatsApp sem perder vendas. Quer ver? São 90 segundos.',
    C: '{nome_pessoa}, pergunta rápida — o atendimento da {nome_empresa} em {servico_principal} no WhatsApp fica parado fora de horas? Pergunto porque temos clientes no mesmo perfil que resolveram isso.',
  },
};

const NICHE_KEYS = Object.keys(NICHOS);

function normalizeVariant(v) {
  const x = String(v || 'A').trim().toUpperCase();
  if (x === 'A' || x === 'B' || x === 'C') return x;
  return 'A';
}

function fillPlaceholders(template, vars) {
  const m = { nome_pessoa: '', nome_empresa: '', servico_principal: '', ...vars };
  return String(template)
    .replace(/\{nome_pessoa\}/g, m.nome_pessoa)
    .replace(/\{nome_empresa\}/g, m.nome_empresa)
    .replace(/\{servico_principal\}/g, m.servico_principal);
}

function getRawTemplate(niche, variant) {
  const n = String(niche || '').toLowerCase();
  const block = NICHOS[n];
  if (!block) throw new Error(`Nicho inválido: ${niche}. Use: ${NICHE_KEYS.join(', ')}`);
  const key = normalizeVariant(variant);
  const body = block[key];
  if (!body) throw new Error(`Variação inválida: ${variant}`);
  return body;
}

function renderMessage(niche, variant, vars) {
  return fillPlaceholders(getRawTemplate(niche, variant), vars);
}

module.exports = {
  NICHOS,
  NICHE_KEYS,
  normalizeVariant,
  fillPlaceholders,
  getRawTemplate,
  renderMessage,
};
