// Handler global de imagens (fora do step aguardando_comprovativo — esse fica em fluxo/venda)
const config = require('../config');
const { removeAccents, BOT_NAME } = config;
const estados = require('../utils/estados');
const { chatHistories } = estados;

const NETFLIX_HOUSEHOLD_KEYWORDS = [
  'ver temporariamente', 'dispositivo', 'fora de casa',
  'residência', 'residencia', 'não faz parte', 'nao faz parte', 'código',
];

function recentMessagesHaveNetflixKeyword(senderNum) {
  const history = chatHistories[senderNum] || [];
  const lastUserMessages = history
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => removeAccents((m.parts[0]?.text || '').toLowerCase()));
  return lastUserMessages.some(text =>
    NETFLIX_HOUSEHOLD_KEYWORDS.some(kw => text.includes(removeAccents(kw)))
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
  const branding = deps.branding || require('../../branding');

  if (!isImage) return { handled: false };
  if (state.step === 'aguardando_comprovativo') return { handled: false }; // fluxo/venda trata

  const hasNetflixContext = recentMessagesHaveNetflixKeyword(senderNum);
  if (hasNetflixContext) {
    await sendWhatsAppMessage(senderNum,
      `📱 *Erro de Localização Netflix detetado!*\n\nA tua Netflix está a pedir verificação de localização. Sigue estes passos:\n\n1️⃣ Clica em *"Ver temporariamente"* no ecrã\n2️⃣ Vai aparecer um código de acesso numérico\n3️⃣ Insere o código quando a app pedir\n4️⃣ Já consegues ver normalmente! ✅\n\nSe o problema persistir, responde aqui e o nosso suporte ajuda imediatamente. 😊\n\n— *${BOT_NAME}*, Assistente Virtual ${branding.nome}`
    );
    if (MAIN_BOSS) {
      await sendWhatsAppMessage(MAIN_BOSS,
        `📱 *AVISO — ERRO DE RESIDÊNCIA NETFLIX*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n📍 Step: ${state.step}\n\n✅ Cliente orientado. Se não resolver, use *assumir ${senderNum}*.`
      );
    }
  } else {
    await sendWhatsAppMessage(senderNum,
      `Envia o teu comprovativo em PDF 📄\n\nSe ainda não fizeste o pedido, escreve *olá* para começar. 😊`
    );
    if (MAIN_BOSS) {
      await sendWhatsAppMessage(MAIN_BOSS,
        `📷 *IMAGEM RECEBIDA (step: ${state.step})*\n👤 ${senderNum}${state.clientName ? ' (' + state.clientName + ')' : ''}\n\nBot pediu comprovativo em PDF. Se quiser intervir: *assumir ${senderNum}*`
      );
    }
  }
  return { handled: true };
}

module.exports = { handleImagem, recentMessagesHaveNetflixKeyword };
