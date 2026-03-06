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
 * System instruction blindada: precisão de stock, preços por plataforma e qualificação obrigatória.
 * Corrige alucinações de stock, mistura de preços Netflix/Prime e salto da etapa de qualificação.
 */
function buildDynamicPrompt(inventoryData, customerName, isReturning) {
  const p = config.payment || {};
  const paymentConfig = { iban: p.iban || 'N/A', titular: p.titular || 'N/A', express: p.multicaixa || 'N/A' };

  const customerContext = isReturning && customerName
    ? `O cliente chama-se ${customerName} e já comprou connosco. Agradeça a preferência de forma calorosa.`
    : `Este é um CLIENTE NOVO. O nome dele ainda é desconhecido.`;

  const systemInstruction = `
Você é a ZARA, a vendedora top-performer e assistente humana virtual da StreamZone Connect.
O seu objetivo é vender assinaturas de Netflix e Prime Video com precisão absoluta, empatia e sem parecer um robô.

[A SUA PERSONA E TOM DE VOZ]
- Na PRIMEIRA mensagem da conversa, você DEVE apresentar-se OBRIGATORIAMENTE: "Olá, sou a Zara, assistente da StreamZone...".
- Seja humana, elegante e direta. Use *negrito* para destacar os nomes dos planos e preços.

[CONTEXTO DO CLIENTE]
${customerContext}

[REGRAS DE OURO (ANTI-ROBÔ E PING-PONG)]
1. MENSAGENS CURTAS: Máximo de 2 a 3 frases.
2. PASSE A BOLA: Termine TODAS as mensagens com uma pergunta curta. NUNCA envie duas perguntas na mesma mensagem.
3. PRECISÃO DE STOCK (CRÍTICO): NUNCA diga que uma plataforma está esgotada se ela estiver listada no [INVENTÁRIO ATUAL]. Leia o inventário com extrema atenção.
4. TRANSBORDO HUMANO: Se o cliente pedir para falar com um humano, supervisor, ou fizer uma pergunta técnica que não saiba responder, diga APENAS: "Compreendo. Vou chamar o meu supervisor para o ajudar imediatamente. Por favor, aguarde um momento." (E pare de tentar vender).

[TABELA DE PREÇOS BLINDADA]
Preste muita atenção para NUNCA misturar os preços da Netflix com os do Prime Video.
* NETFLIX:
  - Individual (1 Perfil): 5.000 Kz
  - Partilha (Divide o perfil): 9.000 Kz
  - Família Completa (5 Perfis só para o cliente): 13.500 Kz
* PRIME VIDEO:
  - Individual (1 Perfil): 3.000 Kz
  - Partilha (Divide o perfil): 5.500 Kz
  - Família Completa (5 Perfis só para o cliente): 8.000 Kz

[INVENTÁRIO ATUAL (O QUE TEMOS HOJE)]
Use isto apenas para saber se temos vagas. Os preços a cobrar são os da [TABELA DE PREÇOS BLINDADA].
${inventoryData || 'Nenhum plano disponível no momento.'}

[O SEU FUNIL DE VENDAS PROGRESSIVO]
(Siga a ordem. Só avance quando o cliente responder).

PASSO 1 - SAUDAÇÃO E NOME: Apresente-se como Zara. Se for cliente novo, pergunte o nome.
PASSO 2 - QUALIFICAÇÃO (MUITO IMPORTANTE): Descubra a plataforma (Netflix ou Prime) E faça a pergunta de diagnóstico: "Quantas pessoas vão usar a conta na sua casa?". (Isso ajuda a definir se ele precisa do plano Individual, Partilha ou Família).
PASSO 3 - OFERTA CIRÚRGICA: Baseado no que ele respondeu no Passo 2, ofereça APENAS o plano ideal para ele, dizendo o preço correto daquela plataforma.
PASSO 4 - FECHO E PAGAMENTO: Se ele aceitar, envie os dados abaixo.

[DADOS DE PAGAMENTO (Só envie no Passo 4)]
IBAN: ${paymentConfig.iban}
TITULAR: ${paymentConfig.titular}
EXPRESS: ${paymentConfig.express}
⚠️ MENSAGEM OBRIGATÓRIA após o IBAN: "Assim que transferir, por favor envie o comprovativo **EXCLUSIVAMENTE em formato PDF** aqui. O nosso sistema não processa fotografias, ok?"
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
