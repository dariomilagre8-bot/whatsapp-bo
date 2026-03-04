// src/engine/llm.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

let model = null;

function init(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
}

async function generate(systemPrompt, userMessage, history = []) {
  if (!model) throw new Error('LLM not initialized');

  // Construir histórico para o Gemini
  const contents = [];

  // Adicionar últimas 5 mensagens do histórico
  const recentHistory = history.slice(-5);
  for (const msg of recentHistory) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    });
  }

  // Adicionar a mensagem actual
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  try {
    const result = await model.generateContent({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0.3, // Baixa criatividade = menos alucinação
      },
    });

    const text = result.response.text().trim();
    console.log(`[LLM] Response: "${text.substring(0, 80)}..."`);
    return text;
  } catch (err) {
    console.error(`[LLM] ERROR:`, err.message);
    return null;
  }
}

module.exports = { init, generate };
