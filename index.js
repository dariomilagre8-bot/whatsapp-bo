require('dotenv').config();
const axios = require('axios');
const express = require('express');
const app = express();

const port = process.env.PORT || 80;
const API_KEY = process.env.GEMINI_API_KEY;

async function listarModelosDisponiveis() {
    console.log("==========================================");
    console.log("🔍 A CONSULTAR A API DO GOOGLE...");
    console.log("==========================================");

    try {
        // Pedido direto à API para listar modelos
        const response = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`
        );

        const modelos = response.data.models;
        
        console.log(`✅ ENCONTRADOS ${modelos.length} MODELOS:`);
        
        // Filtra e mostra apenas os que servem para gerar texto (chat)
        const modelosDeChat = modelos.filter(m => m.supportedGenerationMethods.includes("generateContent"));

        modelosDeChat.forEach(model => {
            console.log(`📌 NOME: ${model.name}`);
            console.log(`   Versão: ${model.version}`);
            console.log(`   Descrição: ${model.displayName}`);
            console.log("------------------------------------------");
        });

        if (modelosDeChat.length === 0) {
            console.log("⚠️ A API respondeu, mas não listou modelos de 'generateContent'.");
        }

    } catch (error) {
        console.error("❌ ERRO FATAL AO LISTAR MODELOS:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Dados: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(error.message);
        }
    }
    console.log("==========================================");
}

// Inicia o teste imediatamente
listarModelosDisponiveis();

// Mantém o servidor vivo para veres o log
app.get('/', (req, res) => res.send('Modo Diagnóstico Ativo'));
app.listen(port, () => console.log(`Diagnóstico a rodar na porta ${port}`));