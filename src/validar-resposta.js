/**
 * [CPA] Anti-alucinação — valida respostas da Zara antes de enviar.
 * Bloqueia: emails de conta, senhas, termos internos, comandos, confirmação de pagamento, preços inventados.
 */
const PRECOS_OFICIAIS = [3000, 5500, 8000, 5000, 9000, 13500];

const BLOQUEIOS = [
  { regex: /[\w.-]+@(gmail|hotmail|outlook|yahoo)\.(com|co|net)/gi, motivo: 'email_vazado' },
  { regex: /\b(senha|password|pass)\s*[:=]\s*\S+/gi, motivo: 'senha_vazada' },
  { regex: /\[.+?\]/, motivo: 'placeholder' },
  { regex: /\b(evolution|easypanel|supabase|gemini|webhook|api.?key|node\.?js|docker|n8n|redis|dashboard|admin|planilha)\b/gi, motivo: 'termo_interno' },
  { regex: /#(humano|pausar|retomar|status|clientes)/gi, motivo: 'comando_interno' },
  { regex: /(pagamento|transfer[eê]ncia).{0,20}(confirmad|recebid|aprovad|validad)/gi, motivo: 'confirmou_pagamento' },
  { regex: /(confirmamos|recebemos|aprovamos).{0,20}(pagamento|transfer)/gi, motivo: 'confirmou_pagamento' },
  { regex: /\b(sou (um |uma )?(bot|rob[oô]|ia|intelig[eê]ncia artificial|programa|modelo|LLM|assistente virtual))\b/gi, motivo: 'admitiu_bot' },
];

const MSG_PRECO_INVALIDO = 'Vou pedir ao responsável para lhe confirmar os valores exactos neste momento.';

function validarResposta(resposta) {
  if (typeof resposta !== 'string' || !resposta.trim()) {
    return { valido: false, motivo: 'resposta_vazia' };
  }

  for (const b of BLOQUEIOS) {
    const re = new RegExp(b.regex.source, b.regex.flags);
    if (re.test(resposta)) {
      return { valido: false, motivo: b.motivo };
    }
  }

  const matchPrecos = resposta.match(/(\d[\d.,]*)\s*kz/gi);
  if (matchPrecos) {
    for (const m of matchPrecos) {
      const valor = parseInt(m.replace(/[^\d]/g, ''), 10);
      if (valor > 0 && !PRECOS_OFICIAIS.includes(valor)) {
        return { valido: false, motivo: 'preco_inventado' };
      }
    }
  }

  if (resposta.length > 500) {
    return { valido: false, motivo: 'muito_longo' };
  }

  return { valido: true };
}

function respostaFallback(motivo) {
  const fallbacks = {
    email_vazado: 'Em que posso ajudá-lo(a)? 😊',
    senha_vazada: 'Em que posso ajudá-lo(a)? 😊',
    termo_interno: 'Em que posso ajudá-lo(a)? 😊',
    comando_interno: 'Em que posso ajudá-lo(a)? 😊',
    confirmou_pagamento: 'O responsável irá verificar o pagamento e confirmar em breve. Obrigado(a) pela paciência! 🙏',
    admitiu_bot: 'Sou a Zara, assistente da StreamZone Connect! Em que posso ajudar? 😊',
    preco_inventado: MSG_PRECO_INVALIDO,
    muito_longo: 'Em que posso ajudá-lo(a)? 😊',
    resposta_vazia: 'Em que posso ajudá-lo(a)? 😊',
  };
  return fallbacks[motivo] || 'Em que posso ajudá-lo(a)? 😊';
}

// Compatibilidade com código que usa validarRespostaZara
function validarRespostaZara(resposta) {
  const r = validarResposta(resposta);
  return {
    valido: r.valido,
    motivo: r.motivo,
    substituir: r.valido ? null : respostaFallback(r.motivo),
  };
}

module.exports = {
  validarResposta,
  validarRespostaZara,
  respostaFallback,
  PRECOS_OFICIAIS,
  BLOQUEIOS,
  MSG_PRECO_INVALIDO,
};
