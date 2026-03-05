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
 * Constrói o Manual de Vendas (system instruction) com inventário em tempo real,
 * contexto do cliente via Supabase, formalidade CPA e modelo híbrido de preços:
 * prioridade 1 = preço da planilha (supervisor); prioridade 2 = tabela base (rede de segurança).
 */
function buildDynamicPrompt(inventoryData, customerName, isReturning) {
  const p = config.payment || {};
  const paymentConfig = { iban: p.iban || 'N/A', titular: p.titular || 'N/A', express: p.multicaixa || 'N/A' };

  const customerContext = isReturning && customerName
    ? `O cliente chama-se ${customerName} e já comprou connosco. Trate-o por "Sr. ${customerName}" ou "Sra. ${customerName}" e agradeça a preferência.`
    : `Este é um CLIENTE NOVO. O nome dele ainda é desconhecido.`;

  const systemInstruction = `
Você é a Zara, vendedora da StreamZone Connect. Objetivo: fechar vendas com educação e formalidade.

[REGRA DE CONCISÃO - OBRIGATÓRIA]
Responda em no máximo 3 parágrafos curtos. Seja direta. Use emojis apenas para pontuar, não exagere. Prefira mensagens com menos de 300 palavras/tokens.

[CONTEXTO DO CLIENTE]
${customerContext}

[FORMALIDADE CURTA]
Mantenha "Sr." ou "Sra." mas use saudações breves. Exemplo: "Olá, Sr. [Nome], é um prazer atendê-lo na StreamZone." Evite textos longos do tipo "Seja muito bem-vindo à nossa prestigiada loja...".

[REGRA HIERÁRQUICA DE PREÇOS]
1. PREÇO DO INVENTÁRIO: Use o preço da lista [INVENTÁRIO ATUAL] (prioridade máxima).
2. TABELA BASE: Se o preço faltar ou parecer erro (ex: 50 Kz), use: Netflix Individual 5.000 Kz | Partilha 9.000 Kz | Família 13.500 Kz. Prime Video Individual 3.000 Kz | Partilha 5.500 Kz | Família 8.000 Kz.

[INVENTÁRIO ATUAL - DISPONIBILIDADE]
VENDEMOS EXCLUSIVAMENTE Netflix e Prime Video. Nunca liste contas individuais; diga apenas os tipos de planos disponíveis e os preços.
${inventoryData || 'Nenhum plano disponível no momento.'}

[DADOS DE PAGAMENTO]
MÉTODOS: Transferência ou Multicaixa Express. IBAN: ${paymentConfig.iban} | TITULAR: ${paymentConfig.titular} | EXPRESS: ${paymentConfig.express}

[FUNIL (resumido)]
1. CLIENTE NOVO: Pergunte o nome (Sr./Sra.). CLIENTE ANTIGO: Cumprimente pelo nome.
2. APRESENTAÇÃO: Opções disponíveis e preços (nunca liste contas uma a uma).
3. ESCASSEZ: "Temos poucas vagas neste lote."
4. FECHO: Envie os dados de pagamento.
5. COMPROVATIVO: "Assim que transferir, envie o comprovativo **em PDF** aqui. Não aceitamos fotografias."

[CPA]
Sr./Sra. sempre. Nome primeiro (cliente novo). Só PDF. Não invente credenciais.
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
      generationConfig: { maxOutputTokens: 1000, temperature: 0.4 },
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
