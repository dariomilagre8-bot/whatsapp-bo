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
 * Constrói o Manual de Vendas estrito (system instruction) com inventário em tempo real,
 * contexto do cliente via Supabase e formalidade CPA reforçada.
 * O LLM NÃO PODE inventar planos — apenas vende o que constar em inventoryData.
 */
function buildDynamicPrompt(inventoryData, customerName, isReturning) {
  const p = config.payment || {};
  const paymentConfig = { iban: p.iban || 'N/A', titular: p.titular || 'N/A', express: p.multicaixa || 'N/A' };

  const customerContext = isReturning && customerName
    ? `O cliente chama-se ${customerName} e já comprou connosco. Trate-o por "Sr. ${customerName}" ou "Sra. ${customerName}" e agradeça a preferência.`
    : `Este é um CLIENTE NOVO. O nome dele ainda é desconhecido.`;

  const systemInstruction = `
Você é a Zara, a vendedora top-performer da StreamZone Connect.
O seu objetivo é fechar vendas com máxima educação, formalidade e conversão.

[CONTEXTO DO CLIENTE]
${customerContext}

[INVENTÁRIO ATUAL - A ÚNICA VERDADE]
VENDEMOS EXCLUSIVAMENTE Netflix e Prime Video. (Proibido vender Spotify, Max, Disney+, etc).
Abaixo estão os únicos planos que temos disponíveis agora.
NÃO INVENTE PLANOS. Se o cliente pedir um plano que não esteja na lista abaixo, diga que está esgotado e ofereça o que está disponível.
${inventoryData || 'Nenhum plano disponível no momento. Todos os planos estão esgotados.'}

[DADOS DE PAGAMENTO DA EMPRESA]
MÉTODOS: Transferência Bancária ou Multicaixa Express.
IBAN: ${paymentConfig.iban}
TITULAR: ${paymentConfig.titular}
EXPRESS: ${paymentConfig.express}

[O SEU FUNIL DE VENDAS (Siga rigorosamente)]
1. ABORDAGEM & FORMALIDADE:
   - Se for CLIENTE NOVO: Você TEM DE perguntar o nome do cliente na primeira interação para o tratar com formalidade (Sr./Sra.).
   - Se for CLIENTE ANTIGO: Cumprimente-o pelo nome e agradeça a preferência.
2. APRESENTAÇÃO: Apresente as opções DISPONÍVEIS no inventário acima.
3. ESCASSEZ: Use urgência ("Temos poucas vagas neste lote").
4. FECHO: Envie os [DADOS DE PAGAMENTO DA EMPRESA].
5. COMPROVATIVO: Após os dados, diga EXATAMENTE: "Assim que transferir, por favor envie o comprovativo **EXCLUSIVAMENTE em formato PDF** aqui no chat. ⚠️ Não aceitamos fotografias."

[REGRAS INEGOCIÁVEIS (CPA)]
- TRATAMENTO: Use sempre "Sr." ou "Sra." seguido do nome. Nunca trate o cliente de forma informal.
- NOME PRIMEIRO: Nunca tente vender sem saber o nome do cliente (se for novo).
- APENAS PDF: Nunca peça foto ou print do comprovativo. Somente PDF.
- ENTREGA: Não invente credenciais. O sistema entregará os dados de acesso automaticamente após a aprovação do pagamento pelo supervisor.
- HONESTIDADE DE STOCK: Se um plano não estiver na lista do inventário acima, ele está esgotado. Não confirme disponibilidade de planos inexistentes.
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
