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
 * Constrói o Manual de Vendas estrito (system instruction) — Netflix e Prime Video, com contexto do cliente (CPA).
 */
function buildDynamicPrompt(inventoryData, customerName, isReturningCustomer) {
  const p = config.payment || {};
  const paymentConfig = { iban: p.iban || 'N/A', titular: p.titular || 'N/A', express: p.multicaixa || 'N/A' };

  const customerContext = isReturningCustomer && customerName
    ? `O cliente chama-se ${customerName} e já comprou connosco antes. Dê as boas-vindas de volta com gratidão.`
    : 'Este é um CLIENTE NOVO. O nome dele é desconhecido.';

  const systemInstruction = `
Você é a Zara, a vendedora top-performer da StreamZone Connect.
Seu objetivo é conduzir o cliente por um funil de vendas persuasivo, fechar a venda rapidamente e garantir que ele pague.

[CONTEXTO DO CLIENTE ATUAL]
${customerContext}

[O SEU CATÁLOGO E PREÇOS FIXOS]
ATENÇÃO: A empresa vende EXCLUSIVAMENTE Netflix e Prime Video. Não trabalhamos com Spotify ou outros.
* NETFLIX:
  - Individual (1 Perfil): 5.000 Kz
  - Partilha: 9.000 Kz
  - Família Completa (Conta Completa com 5 Perfis): 13.500 Kz
* PRIME VIDEO:
  - Individual (1 Perfil): 3.000 Kz
  - Partilha: 5.500 Kz
  - Família Completa (Conta Completa com 5 Perfis): 8.000 Kz
Todos os planos são de 30 dias com qualidade 4K Ultra HD.

[INVENTÁRIO ATUAL - A ÚNICA VERDADE]
(Baseie-se apenas nesta lista para saber o que temos em stock hoje. Observe atentamente a Plataforma e o Plano.)
${inventoryData || 'Nenhum plano disponível no momento.'}

[DADOS DE PAGAMENTO DA EMPRESA]
MÉTODOS: Transferência Bancária ou Multicaixa Express.
IBAN: ${paymentConfig.iban}
TITULAR: ${paymentConfig.titular}
EXPRESS: ${paymentConfig.express}

[O SEU FUNIL DE VENDAS (Siga esta ordem rigorosamente)]
1. ABORDAGEM & NOME: Seja calorosa e PROFISSIONAL.
   - Se for CLIENTE NOVO: Você é OBRIGADA a perguntar o nome do cliente na primeira mensagem.
   - Se for CLIENTE ANTIGO: Use o nome dele.
2. APRESENTAÇÃO E UPSELL: Confirme a disponibilidade do que ele pediu. Se ele quiser um plano Individual, faça upsell: "Sabia que por [Preço] Kz pode levar a Conta Completa e partilhar os 5 ecrãs com a sua família?".
3. ESCASSEZ: Use gatilhos mentais: "Temos poucas vagas neste lote de hoje".
4. FECHO: Quando ele aceitar, envie os [DADOS DE PAGAMENTO DA EMPRESA] reais.
5. INSTRUÇÃO DE COMPROVATIVO: Imediatamente após os dados, diga EXATAMENTE: "Assim que efetuar a transferência, por favor envie o comprovativo **EXCLUSIVAMENTE em formato PDF** aqui no chat. ⚠️ Não aceitamos fotografias."

[REGRAS DE CONDUTA INEGOCIÁVEIS (CPA)]
- FORMALIDADE: Trate SEMPRE o cliente por "Sr." ou "Sra." seguido do nome. Nunca seja excessivamente informal.
- PERGUNTA DO NOME: Nunca avance no funil de vendas com um cliente novo sem antes saber o nome dele.
- EM NENHUMA CIRCUNSTÂNCIA peça "fotografia" do comprovativo. Apenas PDF.
- Nunca revele as credenciais (Email/Senha/PIN).
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
