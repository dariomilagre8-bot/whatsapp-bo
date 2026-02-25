// Handler global de imagens (fora do step aguardando_comprovativo — esse fica em fluxo/venda)
const config = require('../config');
const { removeAccents, RESPOSTAS_FIXAS, RESPOSTAS_TEXTO } = config;
const estados = require('../utils/estados');
const { chatHistories } = estados;

function recentMessagesHaveNetflixKeyword(senderNum) {
  const history = chatHistories[senderNum] || [];
  const lastMessages = history
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.parts[0]?.text || '');
  return lastMessages.some(text =>
    RESPOSTAS_FIXAS.localizacao.some(p => p.test(text))
  );
}

/**
 * Handler global de imagem: fora de aguardando_comprovativo.
 * Se step === aguardando_comprovativo → retorna { handled: false } para o fluxo tratar.
 * Caso contrário: keywords Netflix → guia localização; senão → pedir PDF.
 * @returns {{ handled: boolean }}
 */
async function handleImagem(deps, senderNum, state, isImage) {
  const { sendWhatsAppMessage, MAIN_BOSS } = deps;

  if (!isImage) return { handled: false };
  if (state.step === 'aguardando_comprovativo') return { handled: false };

  const hasNetflixContext = recentMessagesHaveNetflixKeyword(senderNum);
  if (hasNetflixContext) {
    await sendWhatsAppMessage(senderNum, RESPOSTAS_TEXTO.imagem_com_keywords_netflix());
    if (MAIN_BOSS) {
      await sendWhatsAppMessage(MAIN_BOSS,
        `📱 AVISO — ERRO LOCALIZAÇÃO NETFLIX\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\nStep: ${state.step}\nCliente orientado. Se não resolver: assumir ${senderNum}`
      );
    }
  } else {
    await sendWhatsAppMessage(senderNum, RESPOSTAS_TEXTO.imagem_sem_contexto());
    if (MAIN_BOSS) {
      await sendWhatsAppMessage(MAIN_BOSS,
        `📷 IMAGEM RECEBIDA (step: ${state.step})\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\nBot pediu PDF. Se quiser intervir: assumir ${senderNum}`
      );
    }
  }
  return { handled: true };
}

module.exports = { handleImagem, recentMessagesHaveNetflixKeyword };
