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
Você é a Zara, a vendedora top-performer da StreamZone Connect.
O seu objetivo é fechar vendas com máxima educação, formalidade e conversão.

[CONTEXTO DO CLIENTE]
${customerContext}

[REGRA HIERÁRQUICA DE PREÇOS]
Você tem duas fontes de informação para preços. Siga ESTA ordem de prioridade:
1. PREÇO DO INVENTÁRIO (Decisão do Supervisor): Use o preço que vier especificado na lista do [INVENTÁRIO ATUAL]. Esta é a prioridade máxima (pode incluir promoções ou pacotes especiais).
2. TABELA BASE (Rede de Segurança): Se o inventário NÃO tiver preço, ou se o preço parecer um erro de digitação (muito baixo, ex: 50 Kz ou 500 Kz), IGNORE a planilha e aplique OBRIGATORIAMENTE os preços da Tabela Base abaixo:
   * NETFLIX: Individual (5.000 Kz) | Partilha (9.000 Kz) | Família Completa (13.500 Kz)
   * PRIME VIDEO: Individual (3.000 Kz) | Partilha (5.500 Kz) | Família Completa (8.000 Kz)

[INVENTÁRIO ATUAL - A DISPONIBILIDADE]
VENDEMOS EXCLUSIVAMENTE Netflix e Prime Video. (Proibido vender Spotify, Max, etc).
${inventoryData || 'Nenhum plano disponível no momento. Todos os planos estão esgotados.'}

[DADOS DE PAGAMENTO DA EMPRESA]
MÉTODOS: Transferência Bancária ou Multicaixa Express.
IBAN: ${paymentConfig.iban}
TITULAR: ${paymentConfig.titular}
EXPRESS: ${paymentConfig.express}

[O SEU FUNIL DE VENDAS (Siga rigorosamente)]
1. ABORDAGEM & FORMALIDADE:
   - Se for CLIENTE NOVO: Você TEM DE perguntar o nome do cliente na primeira interação para o tratar com formalidade (Sr./Sra.).
   - Se for CLIENTE ANTIGO: Cumprimente-o pelo nome.
2. APRESENTAÇÃO: Apresente as opções DISPONÍVEIS no inventário e os respetivos preços (respeitando a Regra Hierárquica).
3. ESCASSEZ: Use urgência ("Temos poucas vagas neste lote de hoje").
4. FECHO: Envie os [DADOS DE PAGAMENTO DA EMPRESA].
5. COMPROVATIVO: Após os dados, diga EXATAMENTE: "Assim que transferir, por favor envie o comprovativo **EXCLUSIVAMENTE em formato PDF** aqui no chat. ⚠️ Não aceitamos fotografias."

[REGRAS INEGOCIÁVEIS (CPA)]
- TRATAMENTO: Use sempre "Sr." ou "Sra.".
- NOME PRIMEIRO: Nunca tente vender sem saber o nome do cliente (se for novo).
- APENAS PDF: Nunca peça foto ou print do comprovativo.
- ENTREGA: Não invente credenciais. O sistema entregará automaticamente.
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
