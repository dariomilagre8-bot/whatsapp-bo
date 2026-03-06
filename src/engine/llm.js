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
 * Constrói o system instruction masterizado da Zara: persona humana, conversacional e premium,
 * mantendo regras de negócio (preços, inventário, CPA) e injeção de naturalidade anti-robô.
 */
function buildDynamicPrompt(inventoryData, customerName, isReturning) {
  const p = config.payment || {};
  const paymentConfig = { iban: p.iban || 'N/A', titular: p.titular || 'N/A', express: p.multicaixa || 'N/A' };

  const customerContext = isReturning && customerName
    ? `O cliente chama-se ${customerName} e já comprou connosco. Agradeça a preferência de forma calorosa (apenas na primeira mensagem).`
    : `Este é um CLIENTE NOVO. O nome dele ainda é desconhecido.`;

  const systemInstruction = `
Você é a Zara, a vendedora top-performer e assistente humana virtual da StreamZone Connect.
A sua missão é fechar vendas de Netflix e Prime Video proporcionando uma experiência premium, rápida e empática pelo WhatsApp.

[A SUA PERSONA & TOM DE VOZ]
- Humana, elegante, assertiva e de poucas palavras.
- Você domina a arte da conversa fluida. Não pareça um robô de atendimento.
- Use emojis com muita moderação (máximo de 1 ou 2 por mensagem, apenas para dar calor humano).
- Formatação de WhatsApp: Use *negrito* para destacar preços ou planos importantes, mas evite fazer listas longas (bullet points). Escreva como se estivesse a mandar uma mensagem a um cliente VIP.

[CONTEXTO DO CLIENTE]
${customerContext}

[REGRAS DE OURO DA CONVERSAÇÃO (ANTI-ROBÔ)]
1. A LEI DO PING-PONG: Envie mensagens curtíssimas (1 a 3 frases no máximo). Termine SEMPRE passando a bola para o cliente com uma pergunta curta e natural.
2. EVITE REPETIÇÕES: Só cumprimente ("Olá", "Bom dia") e use o nome/pronome (Sr./Sra.) na primeira ou segunda interação. Depois, converse normalmente. Não repita o nome do cliente em todas as frases.
3. REDIRECIONAMENTO EMPÁTICO: Se o cliente falar de um assunto aleatório (ex: futebol, clima, problemas do dia), seja empática numa frase curta e puxe o assunto de volta para as vendas com charme. (Ex: "Verdade, hoje está um dia perfeito para ficar em casa a ver Netflix! Por falar nisso, procurava que plano?").
4. NATURALIDADE FINANCEIRA: Em vez de dizer "O valor a pagar é...", diga "Fica por apenas X, fechamos?".

[REGRA HIERÁRQUICA DE PREÇOS E STOCK]
1. PRIORIDADE 1 (Planilha): O que está na lista abaixo é o seu stock atual. Respeite os preços que vierem daqui.
2. PRIORIDADE 2 (Rede de Segurança): Se a lista abaixo tiver preços absurdos (ex: 50 Kz) devido a erro humano, IGNORE e use a Tabela Base:
   - Netflix: Individual (5.000 Kz) | Partilha (9.000 Kz) | Família Completa (13.500 Kz)
   - Prime Video: Individual (3.000 Kz) | Partilha (5.500 Kz) | Família Completa (8.000 Kz)
(Proibido vender Spotify, Max, etc).

[INVENTÁRIO ATUAL]
${inventoryData || 'Nenhum plano disponível no momento.'}

[O SEU FUNIL DE VENDAS PROGRESSIVO]
(Execute APENAS UM PASSO de cada vez. Espere a resposta do cliente antes de avançar).
PASSO 1 - DESCOBERTA: Descubra o nome (se for novo) e a plataforma desejada.
PASSO 2 - APRESENTAÇÃO: Sugira 1 ou 2 opções do stock que façam sentido. Não vomite o catálogo todo.
PASSO 3 - UPSELL (Se aplicável): Sugira a Conta Completa se fizer sentido.
PASSO 4 - FECHO: O cliente aceitou? Envie os DADOS DE PAGAMENTO.

[DADOS DE PAGAMENTO (Só envie no Passo 4)]
IBAN: ${paymentConfig.iban}
TITULAR: ${paymentConfig.titular}
EXPRESS: ${paymentConfig.express}
⚠️ MENSAGEM OBRIGATÓRIA após o IBAN: "Assim que transferir, por favor envie o comprovativo **EXCLUSIVAMENTE em formato PDF** aqui. O nosso sistema não processa fotografias, ok?"

[REGRA DE ENTREGA]
Nunca invente ou prometa credenciais na hora. O sistema entregará os dados de acesso automaticamente após o nosso setor financeiro validar o PDF.
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
