'use strict';

function mockGenerateReply(userMessage, history) {
  const u = (userMessage || '').toLowerCase();
  const blob = [u]
    .concat((history || []).map((x) => String(x.text || '').toLowerCase()))
    .join(' ');
  if (/bom\s*dia|^bom dia\b/i.test(userMessage)) return 'Bom dia! Aqui está o menu de planos StreamZone.';
  if (/ignora|instruç|instruc|piada/i.test(u))
    return 'Mantenho o foco no menu. Prefere Netflix ou Prime Video?';
  if (/capital.*fran(c|ç)a/i.test(u)) return 'Isso foge ao nosso foco. Quer ver o menu de streaming?';
  if (/humano|supervisor|atendente/i.test(u))
    return 'Compreendo. O supervisor vai tratar com um atendente humano.';
  if (/quero\s+comprar|\bcomprar\b/i.test(u) && /netflix|prime|individual|partilha/i.test(blob))
    return 'Excelente. Segue o pagamento por Multicaixa com dados de pagamento indicados.';
  if (/afinal|prime\s*video|\bprime\b/i.test(u) && /netflix/i.test(blob))
    return 'Prime Video Individual: 3.000 Kz no menu.';
  if (/netflx|netflix|boss|kuia|custa|pre[çc]o|presu|individual/i.test(u))
    return 'Netflix Individual: 5.000 Kz.';
  if (/queria saber|preço da netflix|preço|netflix/i.test(u) && /individual|netflix/i.test(blob))
    return 'O individual Netflix são 5.000 Kz.';
  return 'Posso mostrar o menu de serviços?';
}

module.exports = { mockGenerateReply };
