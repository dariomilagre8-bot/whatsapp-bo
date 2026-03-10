// src/crm/complaints.js — Detecção e gestão de reclamações técnicas
// Non-blocking. Intercepta ANTES do LLM para evitar tentativas de venda no momento de crise.

/**
 * Padrões de reclamação técnica.
 * Detecta: problemas de acesso, senha, perfil, bloqueio, serviço parado.
 */
const COMPLAINT_PATTERNS = [
  /n[aã]o\s*(est[aá]\s*a?\s*)?(funciona(r|ndo)?|acess[ao]r?|entra(r|ndo)?|abre?|carrega)/i,
  /\b(erro|problema|falha|bug|crash)\b/i,
  /senha\s*(errad[ao]|mudou|foi\s*mud|diferente|incorret|wrong)/i,
  /(mudaram|tiraram|removeram|apagaram|retiraram|alteraram)\s*(a?\s*minha|o?\s*meu)?\s*(senha|perfil|conta|acesso)/i,
  /n[aã]o\s*consigo\s*(entrar|acess[ao]r?|aceder|log[ao]r?|abrir|ver\s*os?\s*perfis?)/i,
  /(conta|perfil|acesso|servi[cç]o)\s*(bloqueada?|suspens[ao]|banid[ao]|cortad[ao]|cancelad[ao])/i,
  /n[aã]o\s*(aparece|encontro|vejo|tenho\s*acesso|funciona)\b/i,
  /\b(su[am]\s*(tv|tela|ecr[aã])\s*n[aã]o\s*faz\s*parte)\b/i,
  /(servi[cç]o|bot|conta|perfil)\s*(parou|cortou|deixou\s*de\s*funcionar|foi\s*cortad[ao])/i,
  /(paguei|fiz\s*o\s*pagamento|mandei\s*o\s*comprovativo)\s*.{0,30}(n[aã]o\s*recebi|n[aã]o\s*activou|n[aã]o\s*activaram)/i,
  /(perdi|perdeu)\s*(o?\s*(acesso|perfil|senha|conta))/i,
  /(c[oó]digo|c[oó]digos?|sms|verifica[cç][aã]o)\s*(chegou|recebo|preciso)/i,
  /erro\s*(de\s*)?(localiza[cç][aã]o|household|regi[aã]o)/i,
  /\b(n[aã]o\s*d[aá]|d[aá]\s*erro)\b/i,
];

/**
 * Detecta se uma mensagem é uma reclamação técnica.
 * Retorna true se qualquer padrão coincidir.
 */
function detectarReclamacao(text) {
  if (!text) return false;
  return COMPLAINT_PATTERNS.some((p) => p.test(text));
}

/**
 * Formata a notificação de reclamação para o supervisor.
 */
function formatarNotificacaoReclamacao(nome, telefone, plataforma, mensagem) {
  const plat = plataforma ? ` | *Plataforma:* ${plataforma}` : '';
  return (
    `⚠️ *RECLAMAÇÃO TÉCNICA*\n\n` +
    `*Cliente:* ${nome || telefone}\n` +
    `*Número:* ${telefone}${plat}\n` +
    `*Mensagem:* "${(mensagem || '').substring(0, 300)}"\n\n` +
    `💡 Para reactivar o bot após resolver: #retomar ${telefone}`
  );
}

module.exports = { detectarReclamacao, formatarNotificacaoReclamacao };
