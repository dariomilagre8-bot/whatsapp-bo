'use strict';

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODELO = 'gemini-2.5-flash';
const PROMPT_TRANSCRICAO = 'Transcreve o áudio seguinte para texto. Retorna APENAS o texto transcrito, sem comentários.';

let genAI = null;

function _getClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não definida no .env');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Transcreve áudio OGG/Opus recebido da Evolution API via Gemini.
 * @param {string|Buffer} dadosAudio - base64 string ou Buffer do OGG
 * @param {string} mimeType - tipo MIME (padrão: "audio/ogg")
 * @returns {Promise<string>} texto transcrito
 */
async function transcreverAudio(dadosAudio, mimeType = 'audio/ogg') {
  try {
    const client = _getClient();
    const modelo = client.getGenerativeModel({ model: MODELO });

    const base64 = Buffer.isBuffer(dadosAudio)
      ? dadosAudio.toString('base64')
      : dadosAudio;

    const resultado = await modelo.generateContent([
      PROMPT_TRANSCRICAO,
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
    ]);

    const resposta = resultado?.response?.text?.();
    if (!resposta) throw new Error('Gemini não retornou texto na transcrição.');

    return resposta.trim();
  } catch (err) {
    console.error('[audio] Erro na transcrição:', err.message);
    throw err;
  }
}

/**
 * Extrai dados de áudio do payload da Evolution API (webhook audioMessage).
 * @param {object} mensagem - payload do webhook
 * @returns {{dados: string, mime: string}}
 */
function extrairAudioEvolution(mensagem) {
  const audio =
    mensagem?.message?.audioMessage ||
    mensagem?.message?.pttMessage ||
    mensagem?.audioMessage ||
    mensagem?.pttMessage ||
    mensagem;

  const base64 = audio?.base64 || null;
  const mime = audio?.mimetype || 'audio/ogg; codecs=opus';

  if (!base64) throw new Error('Áudio não encontrado no payload da Evolution API.');

  // Normaliza para audio/ogg caso venha com codecs
  const mimeNormalizado = mime.startsWith('audio/ogg') ? 'audio/ogg' : mime;

  return { dados: base64, mime: mimeNormalizado };
}

/**
 * Pipeline completo: recebe mensagem do webhook → transcrição → texto.
 * @param {object} mensagem - payload audioMessage/pttMessage da Evolution API
 * @returns {Promise<string>} texto transcrito
 */
async function processarAudio(mensagem) {
  try {
    const { dados, mime } = extrairAudioEvolution(mensagem);
    return await transcreverAudio(dados, mime);
  } catch (err) {
    console.error('[audio] Erro ao processar áudio:', err.message);
    throw err;
  }
}

module.exports = { transcreverAudio, processarAudio, extrairAudioEvolution };
