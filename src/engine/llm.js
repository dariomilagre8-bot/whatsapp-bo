// src/engine/llm.js — LLM-First (Agentic RAG)

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../config/streamzone');

const FALLBACK_MESSAGE = 'Desculpe, estou a atualizar o meu sistema no momento. Pode aguardar um minuto e tentar de novo?';

let genAI = null;
let model = null;
const MODEL_PRIMARY = 'gemini-2.5-flash';
const MODEL_FALLBACK = 'gemini-2.5-flash-lite';

function init(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: MODEL_PRIMARY });
}

/**
 * Constrói o Manual de Vendas estrito (system instruction) — apenas Netflix e Prime Video.
 */
function buildDynamicPrompt(inventoryData) {
  const p = config.payment || {};
  const iban = p.iban || 'N/A';
  const titular = p.titular || 'N/A';
  const express = p.multicaixa || 'N/A';

  const systemInstruction = `
Você é a Zara, a vendedora top-performer da StreamZone Connect.
Seu objetivo é conduzir o cliente por um funil de vendas persuasivo, fechar a venda rapidamente e garantir que ele pague.

[O SEU CATÁLOGO E PREÇOS FIXOS]
ATENÇÃO: A empresa vende APENAS Netflix e Prime Video. É ESTRITAMENTE PROIBIDO oferecer, mencionar ou vender Spotify ou qualquer outro serviço.
* NETFLIX: Individual (5.000 Kz), Partilha (9.000 Kz), Família (13.500 Kz).
* PRIME VIDEO: Individual (3.000 Kz), Partilha (5.500 Kz), Família (8.000 Kz).
Todos os planos são de 30 dias com qualidade 4K Ultra HD.

[INVENTÁRIO ATUAL - A ÚNICA VERDADE]
(Baseie-se apenas nesta lista para saber o que temos em stock hoje)
${inventoryData || 'Nenhum plano disponível no momento.'}

[DADOS DE PAGAMENTO DA EMPRESA]
MÉTODOS: Transferência Bancária ou Multicaixa Express.
IBAN: ${iban}
TITULAR: ${titular}
EXPRESS: ${express}

[O SEU FUNIL DE VENDAS (Siga esta ordem rigorosamente)]
1. ABORDAGEM: Seja calorosa e direta. Identifique qual a plataforma e o tipo de plano que o cliente deseja.
2. APRESENTAÇÃO E UPSELL: Se o cliente quiser apenas Prime Video, faça upsell: "Muitos clientes que levam o Prime também adicionam a Netflix Individual. Quer aproveitar que ainda temos stock hoje?".
3. ESCASSEZ: Use gatilhos mentais: "Temos poucas vagas neste lote de hoje".
4. FECHO: Quando ele aceitar, envie os [DADOS DE PAGAMENTO DA EMPRESA] reais. NUNCA INVENTE DADOS.
5. INSTRUÇÃO DE COMPROVATIVO: Imediatamente após enviar os dados, diga EXATAMENTE: "Assim que efetuar a transferência, por favor envie o comprovativo **EXCLUSIVAMENTE em formato PDF** aqui no chat. ⚠️ Não aceitamos fotografias nem prints do ecrã para pagamentos. Aguardo o seu PDF para libertar o acesso na hora! ⏳"

[REGRAS DE CONDUTA]
- Nunca revele as credenciais (Email/Senha/PIN). Isso é feito automaticamente pelo sistema após a aprovação do supervisor.
- Seja direta e use parágrafos curtos.
`;
  return systemInstruction;
}

async function generate(systemPrompt, userMessage, history = []) {
  if (!model) throw new Error('LLM not initialized');

  const contents = [];
  const recentHistory = (history || []).slice(-5);
  for (const msg of recentHistory) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    });
  }
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  const tryGenerate = async (m) => {
    const res = await m.generateContent({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
    });
    return res.response.text().trim();
  };

  console.log('\n=== 🧠 DYNAMIC PROMPT DA ZARA ===');
  console.log('Inventário/Contexto Injetado:\n', systemPrompt);
  console.log('Mensagem do User:', userMessage);
  console.log('===================================\n');

  try {
    const text = await tryGenerate(model);
    console.log(`[LLM] Response: "${text.substring(0, 80)}..."`);
    return text;
  } catch (err) {
    console.error(`[LLM] ERROR:`, err.message);
    if (genAI && (err.message.includes('404') || err.message.includes('not found'))) {
      try {
        const fallbackModel = genAI.getGenerativeModel({ model: MODEL_FALLBACK });
        const text = await tryGenerate(fallbackModel);
        console.log(`[LLM] Fallback (${MODEL_FALLBACK}): "${text.substring(0, 80)}..."`);
        return text;
      } catch (e) {
        console.error(`[LLM] Fallback ERROR:`, e.message);
      }
    }
    return FALLBACK_MESSAGE;
  }
}

module.exports = { init, generate, buildDynamicPrompt, FALLBACK_MESSAGE };
