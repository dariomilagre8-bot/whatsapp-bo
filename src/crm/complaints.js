// src/crm/complaints.js — Detecção e gestão de reclamações técnicas
// Non-blocking. Intercepta ANTES do LLM para evitar tentativas de venda no momento de crise.

/**
 * Padrões de LOCALIZAÇÃO / HOUSEHOLD Netflix.
 * Estes são auto-resolvíveis: o bot dá instruções antes de escalar.
 */
const LOCATION_PATTERNS = [
  /erro\s*(de\s*)?(localiza[cç][aã]o|household|regi[aã]o)/i,
  /\b(su[am]\s*(tv|tela|ecr[aã])\s*n[aã]o\s*faz\s*parte)\b/i,
  /\b(household|agregado)\b/i,
  /\b(actualizar|atualizar)\s*(a?\s*)?(localiza[cç][aã]o)/i,
  /\b(n[aã]o\s*faz\s*parte\s*(d[oe]s?te?\s*)?(agregado|household))\b/i,
  /\b(usar\s*(em\s*)?(outr[ao]|diferente)\s*(lugar|local|sitio|s[ií]tio|casa|tv))\b/i,
  /\b(mudei\s*de\s*casa|noutr[ao]\s*(casa|local))\b/i,
  /(na|em)\s*casa\s*(d[oe]|da?\s*)\s*(meu|minha|um|amig|famili|m[aã]e|pai|irm[aã])/i,
  /\b(localiza[cç][aã]o\s*(da\s*netflix|principal))\b/i,
  /\b(tv\s*(de\s*)?(outr[ao]|diferente)\s*(quarto|sala|casa))\b/i,
  /\b(aparece\s*(um\s*)?(aviso|mensagem)\s*.{0,20}(localiza[cç]|household|agregado))\b/i,
];

/**
 * Padrões de reclamação técnica GRAVE (escalar ao supervisor).
 * Exclui localização (tratada separadamente).
 */
const COMPLAINT_PATTERNS = [
  /n[aã]o\s*(est[aá]\s*a?\s*)?(funciona(r|ndo)?|acess[ao]r?|entra(r|ndo)?|abre?|carrega)/i,
  /senha\s*.{0,10}(errad[ao]|mudou|foi\s*mud|diferente|incorret|wrong)/i,
  /\b(a?\s*senha)\s*(est[aá]|está)\s*(errad[ao]|incorret)/i,
  /(mudaram|tiraram|removeram|apagaram|retiraram|alteraram)\s*(a?\s*minha|o?\s*meu)?\s*(senha|perfil|conta|acesso)/i,
  /n[aã]o\s*consigo\s*(entrar|acess[ao]r?|aceder|log[ao]r?|abrir|ver\s*os?\s*perfis?)/i,
  /(conta|perfil|acesso|servi[cç]o)\s*.{0,10}(bloqueada?|suspens[ao]|banid[ao]|cortad[ao]|cancelad[ao])/i,
  /n[aã]o\s*(aparece|encontro|vejo|tenho\s*acesso)\b/i,
  /(servi[cç]o|bot|conta|perfil)\s*(parou|cortou|deixou\s*de\s*funcionar|foi\s*cortad[ao])/i,
  /(paguei|fiz\s*o\s*pagamento|mandei\s*o\s*comprovativo)\s*.{0,30}(n[aã]o\s*recebi|n[aã]o\s*activou|n[aã]o\s*activaram)/i,
  /(perdi|perdeu)\s*(o?\s*(acesso|perfil|senha|conta))/i,
  /(c[oó]digo|c[oó]digos?|sms|verifica[cç][aã]o)\s*(chegou|recebo|preciso)/i,
  /\b(n[aã]o\s*d[aá]|d[aá]\s*erro)\b/i,
];

/**
 * Detecta se é um problema de localização/Household Netflix (auto-resolvível).
 */
function detectarLocalizacao(text) {
  if (!text) return false;
  return LOCATION_PATTERNS.some((p) => p.test(text));
}

/**
 * Detecta se uma mensagem é uma reclamação técnica GRAVE (escalar ao supervisor).
 * Exclui problemas de localização que são tratados com auto-ajuda.
 */
function detectarReclamacao(text) {
  if (!text) return false;
  if (detectarLocalizacao(text)) return false;
  return COMPLAINT_PATTERNS.some((p) => p.test(text));
}

/**
 * Gera a mensagem de auto-ajuda para erro de localização/Household.
 */
function gerarRespostaLocalizacao(nomeCliente) {
  const nome = nomeCliente || 'Cliente';
  return (
    `Compreendo perfeitamente, ${nome}. Esse aviso da Netflix acontece quando a conta é usada em localizações diferentes. Vou explicar como resolver:\n\n` +
    `*Passo 1:* No dispositivo onde costuma assistir mais, abra a Netflix e vá a Definicoes > Gerir Acesso e Dispositivos.\n` +
    `*Passo 2:* Seleccione "Actualizar localizacao da Netflix na minha TV". Isto define a sua localizacao como principal.\n` +
    `*Passo 3:* Se estiver a usar noutra TV, ligue esse aparelho a mesma rede Wi-Fi do dispositivo principal pelo menos uma vez.\n` +
    `*Alternativa:* Saia da conta (logout) em todos os dispositivos e entre novamente.\n\n` +
    `Se o problema persistir apos estes passos, avise-me que chamo o responsavel tecnico.`
  );
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

module.exports = { detectarReclamacao, detectarLocalizacao, gerarRespostaLocalizacao, formatarNotificacaoReclamacao };
