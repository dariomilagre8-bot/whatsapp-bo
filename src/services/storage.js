'use strict';

const { supabase } = require('../../supabase');

const BUCKET = 'comprovativos';

/**
 * Faz upload de um comprovativo de pagamento para o Supabase Storage.
 * @param {string|Buffer} dadosImagem - base64 string ou Buffer da imagem
 * @param {string} nomeOriginal - nome sugerido do ficheiro (ex: "img.jpg")
 * @param {string} mimeType - tipo MIME (ex: "image/jpeg")
 * @returns {Promise<{url: string, path: string}>}
 */
async function uploadComprovativo(dadosImagem, nomeOriginal = 'comprovativo.jpg', mimeType = 'image/jpeg') {
  if (!supabase) throw new Error('Supabase não está inicializado.');

  // Converte base64 para Buffer se necessário
  const buffer = Buffer.isBuffer(dadosImagem)
    ? dadosImagem
    : Buffer.from(dadosImagem, 'base64');

  const timestamp = Date.now();
  const ext = nomeOriginal.split('.').pop() || 'jpg';
  const caminho = `pagamentos/${timestamp}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);

  if (!data?.publicUrl) throw new Error('Não foi possível obter a URL pública.');

  return { url: data.publicUrl, path: caminho };
}

/**
 * Extrai dados de imagem do payload da Evolution API (webhook imageMessage).
 * @param {object} mensagem - objecto mensagem do webhook
 * @returns {{dados: string, mime: string, nome: string}}
 */
function extrairImagemEvolution(mensagem) {
  const img = mensagem?.message?.imageMessage || mensagem?.imageMessage || mensagem;

  const base64 = img?.base64 || img?.jpegThumbnail || null;
  const mime = img?.mimetype || 'image/jpeg';
  const nome = img?.fileName || `comprovativo_${Date.now()}.jpg`;

  if (!base64) throw new Error('Imagem não encontrada no payload da Evolution API.');

  return { dados: base64, mime, nome };
}

/**
 * Pipeline completo: recebe mensagem do webhook → upload → URL pública.
 * @param {object} mensagem - payload imageMessage da Evolution API
 * @returns {Promise<{url: string, path: string}>}
 */
async function processarComprativo(mensagem) {
  try {
    const { dados, mime, nome } = extrairImagemEvolution(mensagem);
    return await uploadComprovativo(dados, nome, mime);
  } catch (err) {
    console.error('[storage] Erro ao processar comprovativo:', err.message);
    throw err;
  }
}

module.exports = { uploadComprovativo, processarComprativo, extrairImagemEvolution };
