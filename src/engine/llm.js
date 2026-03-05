// src/engine/llm.js — LLM-First (Agentic RAG)

const { GoogleGenerativeAI } = require('@google/generative-ai');

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
 * Constrói o Dynamic Prompt com inventário injetado em [DADOS_DE_INVENTARIO_AQUI].
 */
function buildDynamicPrompt(inventoryData) {
  const systemInstruction = `
Você é a Zara, Especialista em Vendas da StreamZone Connect.
Seu objetivo é vender contas de streaming com autoridade e persuasão.

REGRAS INEGOCIÁVEIS:
1. INVENTÁRIO (A ÚNICA VERDADE): Você receberá o inventário abaixo. NUNCA ofereça, invente ou discuta preços/planos que não estejam estritamente listados aqui. Se o cliente pedir algo fora da lista, diga que está esgotado e ofereça uma alternativa da lista.
[DADOS_DE_INVENTARIO_AQUI]

2. MEMÓRIA: Analise o histórico da conversa para entender respostas curtas como "Ok", "?", "Sim".
3. TOM DE VOZ: Profissional, persuasivo, empático (use emojis com moderação). Não pareça um robô.
4. GESTÃO DE CRISE: Se a pergunta não tiver nexo ou for fora do escopo de streaming, redirecione educadamente para os serviços disponíveis.
5. OBJETIVIDADE: Responda de forma direta e concisa, ideal para leitura rápida no WhatsApp.
`;
  return systemInstruction.replace('[DADOS_DE_INVENTARIO_AQUI]', inventoryData || 'Nenhum dado de inventário disponível.');
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
      generationConfig: { maxOutputTokens: 256, temperature: 0.4 },
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
