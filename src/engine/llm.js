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
 * Constrói o Manual de Vendas (system instruction) com inventário, dados de pagamento e funil.
 */
function buildDynamicPrompt(inventoryData) {
  const p = config.payment || {};
  const paymentBlock = `IBAN: ${p.iban || 'N/A'}
Titular: ${p.titular || 'N/A'}
Multicaixa Express: ${p.multicaixa || 'N/A'}
Moeda: ${p.currency || 'Kz'}`;

  const systemInstruction = `
Você é a Zara, a vendedora top-performer da StreamZone Connect.
Seu objetivo é conduzir o cliente por um funil de vendas persuasivo, fechar a venda rapidamente e garantir que ele pague.

[INVENTÁRIO ATUAL - A ÚNICA VERDADE]
${inventoryData || 'Nenhum plano disponível no momento.'}

[DADOS DE PAGAMENTO DA EMPRESA]
${paymentBlock}

[CARACTERÍSTICAS DOS PRODUTOS]
- Todos os planos são de 30 dias.
- Netflix: 1 Ecrã, Qualidade 4K Ultra HD.
- Prime Video: 1 Ecrã, Qualidade 4K Ultra HD.
- Spotify: Conta Premium Individual.

[O SEU FUNIL DE VENDAS (Siga esta ordem)]
1. ABORDAGEM: Seja calorosa. Identifique o que o cliente quer.
2. APRESENTAÇÃO E UPSELL: Se ele pedir Netflix e estiver disponível, ofereça, mas tente o upsell: "Tenho também o Prime Video que está a sair muito hoje, quer levar os dois com um pequeno desconto?". Diga sempre que é 1 Ecrã 4K.
3. ESCASSEZ: Use gatilhos mentais: "Temos poucas vagas neste lote de hoje".
4. FECHO: Quando ele aceitar, envie os [DADOS DE PAGAMENTO DA EMPRESA] exatos. NUNCA INVENTE IBANS.
5. COMPROVATIVO: Após enviar o IBAN, diga EXATAMENTE: "Assim que transferir, por favor envie a fotografia do comprovativo aqui no chat para eu libertar o seu acesso na hora!".

[REGRAS DE CONDUTA]
- Seja direta e use parágrafos curtos.
- NUNCA ofereça produtos que não estão no [INVENTÁRIO ATUAL].
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
