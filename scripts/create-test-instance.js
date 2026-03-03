/**
 * Cria a instância Zara-Teste na Evolution API e gera QR code.
 * Uso: node scripts/create-test-instance.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'Zara-Teste';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://whatssiru.46.224.99.52.nip.io/webhook';

async function createInstance() {
  console.log('🔧 A criar instância Zara-Teste na Evolution API...');
  console.log(`   URL: ${EVOLUTION_URL}`);
  console.log(`   Instância: ${INSTANCE_NAME}`);
  console.log(`   Webhook: ${WEBHOOK_URL}`);
  console.log('');

  if (!EVOLUTION_URL || !EVOLUTION_KEY) {
    console.error('❌ Erro: EVOLUTION_API_URL ou EVOLUTION_API_KEY não definidos em .env.test');
    process.exit(1);
  }

  try {
    // 1. Verificar se a instância já existe
    const listRes = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_KEY },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      const instances = Array.isArray(listData) ? listData : (listData.instances || []);
      const exists = instances.some(i => (i.instance?.instanceName || i.instanceName) === INSTANCE_NAME);
      if (exists) {
        console.log(`⚠️  Instância "${INSTANCE_NAME}" já existe. A saltar criação.`);
        console.log('   Para recriar: apaga a instância no manager e corre novamente.');
        await fetchQR();
        return;
      }
    }

    // 2. Criar instância
    const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVOLUTION_KEY,
      },
      body: JSON.stringify({
        instanceName: INSTANCE_NAME,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: {
          url: WEBHOOK_URL,
          events: [
            'MESSAGES_UPSERT',
            'CONNECTION_UPDATE',
          ],
        },
      }),
    });

    const createData = await createRes.json();

    if (createData.error || createData.status === 'error') {
      console.error('❌ Erro ao criar instância:', createData.error || createData.message || JSON.stringify(createData));
      return;
    }

    console.log('✅ Instância criada com sucesso!');
    await fetchQR();

  } catch (err) {
    console.error('❌ Erro de rede:', err.message);
  }
}

async function fetchQR() {
  console.log('\n📱 A gerar QR code...');

  try {
    const qrRes = await fetch(`${EVOLUTION_URL}/instance/connect/${INSTANCE_NAME}`, {
      method: 'GET',
      headers: { apikey: EVOLUTION_KEY },
    });

    const qrData = await qrRes.json();

    if (qrData.base64) {
      const base64Data = qrData.base64.replace(/^data:image\/png;base64,/, '');
      const outPath = path.join(__dirname, '..', 'qr-code-teste.png');
      fs.writeFileSync(outPath, base64Data, 'base64');
      console.log('\n✅ QR code guardado em: qr-code-teste.png');
      console.log('📱 Abre o ficheiro e faz scan com o WhatsApp do teu número pessoal');
    } else if (qrData.code) {
      console.log('\n📱 QR Code (texto):');
      console.log(qrData.code);
    } else {
      console.log('\n⚠️  QR não disponível via API. Acede ao manager da Evolution API:');
      console.log(`   ${EVOLUTION_URL}/manager/`);
      console.log(`   Procura a instância "${INSTANCE_NAME}" e faz scan manualmente.`);
    }

    // Aguardar conexão
    console.log('\n⏳ A aguardar conexão (30 segundos)...');
    await new Promise(r => setTimeout(r, 30000));

    const statusRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${INSTANCE_NAME}`, {
      headers: { apikey: EVOLUTION_KEY },
    });
    const statusData = await statusRes.json();
    const state = statusData.instance?.state || statusData.state || 'desconhecido';

    if (state === 'open') {
      console.log('✅ Zara-Teste CONECTADA com sucesso!');
      console.log('\n   Próximo passo: npm run start:test');
    } else {
      console.log(`⚠️  Estado: ${state}`);
      console.log('   Verifica o scan e tenta novamente se necessário.');
    }

  } catch (err) {
    console.error('❌ Erro ao buscar QR:', err.message);
  }
}

createInstance();
