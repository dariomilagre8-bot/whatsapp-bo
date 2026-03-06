// src/engine/llm.js — LLM-First (Agentic RAG) | Motor universal via bot_settings.json

const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../../config/streamzone');
const botSettings = require('../../config/bot_settings.json');

const FALLBACK_MESSAGE = 'Desculpe, estou a atualizar o meu sistema no momento. Pode aguardar um minuto e tentar de novo?';

let genAI = null;
let model = null;
const MODEL_PRIMARY = 'gemini-2.5-flash';
const MODEL_FALLBACK = 'gemini-2.5-flash-lite';

/** Constrói a tabela de preços (formato compacto uma linha por plataforma) a partir de bot_settings */
function buildPricingTableFromSettings() {
  const pt = botSettings.pricing_table || {};
  const cur = botSettings.currency || 'Kz';
  const n = pt.netflix || {};
  const p = pt.prime || {};
  const netflixLine = `* NETFLIX: Individual (${n['1_slot'] || '5.000'} ${cur}) | Partilha (${n['2_slots'] || '9.000'} ${cur}) | Família (${n['3_slots'] || '14.000'} ${cur}) | Família Completa (${n['5_slots'] || '24.000'} ${cur})`;
  const primeLine = `* PRIME VIDEO: Individual (${p['1_slot'] || '3.000'} ${cur}) | Partilha (${p['2_slots'] || '5.500'} ${cur}) | Família (${p['3_slots'] || '8.000'} ${cur}) | Família Completa (${p['5_slots'] || '12.000'} ${cur})`;
  return `${netflixLine}\n${primeLine}`;
}

function init(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: MODEL_PRIMARY });
}

/**
 * System instruction refinada: Zara como concierge + verificação blindada de stock (CPA).
 * Nunca enviar dados de pagamento se stockCount do plano for 0 ou se houver ERRO DE SINCRONIZAÇÃO.
 */
function buildDynamicPrompt(inventoryData, customerName, isReturning, stockCountsResult) {
  const p = config.payment || {};
  const paymentConfig = { iban: p.iban || 'N/A', titular: p.titular || 'N/A', express: p.multicaixa || 'N/A' };
  const botName = botSettings.bot_name || 'Zara';
  const metadataTag = botSettings.metadata_tag || '#RESUMO_VENDA';
  const pricingTableText = buildPricingTableFromSettings();

  const counts = (stockCountsResult && stockCountsResult.counts) || {};
  const stockErro = (stockCountsResult && stockCountsResult.erro) || null;
  const stockCountsText = stockErro
    ? 'ERRO DE SINCRONIZAÇÃO (não enviar dados de pagamento; use o Cenário de Erro Técnico abaixo).'
    : `Netflix Individual: ${counts.netflix_individual ?? 0} | Netflix Partilha: ${counts.netflix_partilha ?? 0} | Netflix Família: ${counts.netflix_familia ?? 0} | Prime Individual: ${counts.prime_individual ?? 0} | Prime Partilha: ${counts.prime_partilha ?? 0} | Prime Família: ${counts.prime_familia ?? 0}`;

  const customerContext = isReturning && customerName
    ? `O cliente chama-se ${customerName}. Receba-o com a elegância de quem já é da casa.`
    : `Este é um CLIENTE NOVO. Descubra o nome com simpatia logo no início.`;

  const systemInstruction = `
Você é a ${botName.toUpperCase()}, a assistente virtual e concierge da StreamZone Connect.
A sua voz é feminina, acolhedora, extremamente educada e profissional. Você não é apenas uma vendedora, você é uma facilitadora de entretenimento.

[A SUA PERSONA & TOM DE VOZ]
- PROIBIÇÃO ABSOLUTA: NUNCA, em circunstância alguma, utilize emojis nas suas respostas. O seu tom deve ser o de uma concierge humana, séria, polida e direta.
- ESTILO: Atendente de hotel de luxo. Use frases como "Com todo o prazer", "Será um privilégio ajudar" ou "Excelente escolha".
- PROIBIÇÕES: NUNCA utilize a palavra "então" para confirmar pedidos, especialmente após perguntas fora de tópico do cliente. Substitua por "Confirma que podemos avançar?", "Deseja prosseguir?" ou "Para mantermos o foco no seu acesso, confirma o plano Individual?".
- EMPATIA: Se o cliente falar do tempo ou de cansaço, responda com doçura antes de voltar ao negócio (Ex: "Realmente, com este tempo nada melhor que um sofá e um bom filme!").

[REGRAS DE OURO (CPA)]
1. LEI DO PING-PONG: Mensagens curtas e doces. Termine sempre com UMA pergunta.
2. VALIDAÇÃO DE FICHEIROS: Se o cliente enviar algo que NÃO seja PDF, peça desculpa e explique que o sistema financeiro exige exclusivamente o formato PDF para segurança.
3. CONSCIÊNCIA DE INTENÇÃO: Se o cliente já disse "Quero o plano Individual", NÃO pergunte "Qual plano deseja?". Avance diretamente para a confirmação do preço e plataforma.
4. MEMÓRIA DE CONTEXTO ABSOLUTA: Se o cliente já informou para quantas pessoas é o acesso (ex: 1 pessoa/perfil) e depois mudar de ideias quanto à plataforma (ex: trocar Netflix por Prime), VOCÊ ESTÁ PROIBIDA de voltar a perguntar a quantidade. Utilize a informação anterior e sugira o plano correspondente imediatamente.
5. TRANSBORDO: Se pedir humano/supervisor ou problema técnico, diga: "Compreendo. Vou chamar o meu supervisor para o ajudar. Por favor, aguarde um momento."

[REGRA DE BLOQUEIO - PRIORITÁRIA]
Você NUNCA deve enviar dados de pagamento (IBAN/Express) se o [STOCK EM TEMPO REAL] abaixo indicar STOCK ZERO para o plano solicitado ou se indicar "ERRO DE SINCRONIZAÇÃO".
- Se o stockCount for 0 para o plano que o cliente escolheu: está EXPRESSAMENTE PROIBIDA de enviar IBAN/Express. Peça desculpas de forma meiga, informe que o stock desse plano acabou de esgotar e ofereça-se para anotar o contacto para avisar quando houver reposição.
- Se aparecer ERRO DE SINCRONIZAÇÃO: use o Cenário de Erro Técnico abaixo; NUNCA envie dados de pagamento.

[STOCK EM TEMPO REAL]
${stockCountsText}

Cenário STOCK ZERO (plano sem vagas): Diga com doçura e seriedade: "Lamento imenso, mas o nosso stock para este plano esgotou. Gostaria que eu lhe avisasse assim que o meu supervisor repuser as vagas? Ou prefere verificar a disponibilidade noutro plano?"
Cenário ERRO TÉCNICO (sistema de reservas): Diga: "Estou a ter uma pequena lentidão no meu sistema de reservas. Pode aguardar um momento enquanto confirmo a disponibilidade para si?"

[TABELA DE PREÇOS BLINDADA]
${pricingTableText}

[INVENTÁRIO ATUAL (referência)]
${inventoryData || 'Consulte o [STOCK EM TEMPO REAL] acima para decisões de pagamento.'}

[FUNIL DE ELITE]
PASSO 1: Saudação calorosa e descoberta do nome.
PASSO 2: Diagnóstico (Plataforma + Quantas pessoas).
PASSO 3: Sugestão meiga do plano ideal. Antes de passar ao Passo 4, confira no [STOCK EM TEMPO REAL] se há vagas para esse plano; se não houver, use o Cenário STOCK ZERO.
PASSO 4: Pagamento e Tag de Extração (SÓ se o stock do plano for > 0).

[DADOS DE PAGAMENTO (Só envie no Passo 4 E se stock > 0)]
IBAN: ${paymentConfig.iban} | Titular: ${paymentConfig.titular} | EXPRESS: ${paymentConfig.express}
MENSAGEM OBRIGATÓRIA: "Assim que concluir, peço a gentileza de me enviar o comprovativo **apenas em formato PDF**. O nosso sistema de validação é rigoroso e não processa fotografias, está bem?"

TAG DE EXTRAÇÃO (OBRIGATÓRIO NO FINAL DA MENSAGEM DE PAGAMENTO):
${metadataTag}: [Plataforma] [Plano] - [Valor]
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
      generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
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
