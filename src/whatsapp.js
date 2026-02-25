// Cliente Evolution API + envio de mensagens
const axios = require('axios');
const https = require('https');
const { cleanNumber } = require('../googleSheets');
const branding = require('../branding');
const { CATALOGO, PAYMENT } = require('./config');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Retorna { sent: boolean, invalidNumber: boolean }
async function sendWhatsAppMessage(number, text) {
  try {
    const cleanTarget = cleanNumber(number);
    console.log(`📤 SEND: cleanTarget="${cleanTarget}" length=${cleanTarget.length}`);
    if (cleanTarget.length < 9 || cleanTarget.length > 15) {
      console.log(`❌ SEND: Número inválido (length), não enviar.`);
      return { sent: false, invalidNumber: false };
    }
    const finalAddress = cleanTarget + '@s.whatsapp.net';
    const url = `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`;
    console.log(`📤 SEND: URL=${url}`);
    console.log(`📤 SEND: Para=${finalAddress} | Texto=${text.substring(0, 60)}...`);
    await axios.post(url, {
      number: finalAddress, text: text, delay: 1200
    }, { headers: { 'apikey': process.env.EVOLUTION_API_KEY }, httpsAgent });
    console.log(`✅ SEND: Mensagem enviada com sucesso para ${finalAddress}`);
    return { sent: true, invalidNumber: false };
  } catch (e) {
    const data = e.response?.data;
    const isInvalidNumber = (
      e.response?.status === 400 &&
      (data?.exists === false || JSON.stringify(data || '').includes('"exists":false'))
    );
    console.error(`❌ FALHA ENVIO para ${number}:`, e.response ? JSON.stringify(data) : e.message);
    if (isInvalidNumber) {
      console.warn(`⚠️ SEND: Número ${number} não tem WhatsApp (exists: false) — fluxo continuará normalmente.`);
    }
    return { sent: false, invalidNumber: isInvalidNumber };
  }
}

async function sendCredentialsEmail(toEmail, clientName, productName, allCreds) {
  try {
    const credHtml = allCreds.map(c => {
      const unitHdr = c.unitLabel ? `<p style="color:#888;font-size:11px;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:1px">${c.unitLabel}</p>` : '';
      const perfilHtml = c.nomePerfil ? `<p style="margin:3px 0">👤 Perfil: <strong>${c.nomePerfil}</strong></p>` : '';
      const pinHtml = c.pin ? `<p style="margin:3px 0">🔒 PIN: <strong>${c.pin}</strong></p>` : '';
      return `<div style="background:#1a1a1a;border-radius:10px;padding:16px;margin:10px 0;border:1px solid #333">${unitHdr}<p style="margin:3px 0">📧 Email: <strong>${c.email}</strong></p><p style="margin:3px 0">🔑 Senha: <strong>${c.senha}</strong></p>${perfilHtml}${pinHtml}</div>`;
    }).join('');

    const htmlContent = `<div style="background:#0a0a0a;color:#e5e5e5;font-family:Arial,sans-serif;padding:40px;max-width:600px;margin:0 auto"><h1 style="color:${branding.corPrincipal};margin:0 0 4px 0">${branding.nome}</h1><h2 style="color:#fff;font-weight:400;margin:0 0 24px 0">As Tuas Credenciais ${branding.emoji}</h2><p>Olá <strong>${clientName}</strong>,</p><p>Aqui estão os dados da tua conta <strong>${productName}</strong>:</p>${credHtml}<p style="margin-top:32px;padding-top:16px;border-top:1px solid #222;color:#666;font-size:12px">${branding.nome} · Suporte via WhatsApp: +${branding.whatsappSuporte}</p></div>`;

    await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender: { name: branding.nome, email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: toEmail, name: clientName }],
      subject: `${branding.nome} — As tuas credenciais de ${productName}`,
      htmlContent,
    }, {
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    });
    console.log(`✅ EMAIL: Credenciais enviadas via Brevo para ${toEmail}`);
    return true;
  } catch (e) {
    console.error('❌ EMAIL: Falha ao enviar via Brevo:', e.response?.data || e.message);
    return false;
  }
}

async function sendPaymentMessages(number, state) {
  const isMulti = state.cart.length > 1;

  let summary;
  if (isMulti) {
    const lines = state.cart.map((item, i) => {
      const qty = item.quantity || 1;
      const qtyLabel = qty > 1 ? `${qty}x ` : '';
      return `${i + 1}. ${qtyLabel}${item.plataforma} ${item.plan} - ${(item.totalPrice || item.price).toLocaleString('pt')} Kz`;
    });
    summary = `📦 *Resumo do Pedido:*\n${lines.join('\n')}\n💰 *Total: ${state.totalValor.toLocaleString('pt')} Kz*`;
  } else {
    const item = state.cart[0];
    const qty = item.quantity || 1;
    const qtyLabel = qty > 1 ? `${qty}x ` : '';
    summary = `📦 *${qtyLabel}${item.plataforma} - ${item.plan}*\n💰 *Valor: ${(item.totalPrice || item.price).toLocaleString('pt')} Kz*`;
  }
  await sendWhatsAppMessage(number, summary);
  await sendWhatsAppMessage(number, '🏦 *DADOS PARA PAGAMENTO:*');
  await sendWhatsAppMessage(number, PAYMENT.iban);
  await sendWhatsAppMessage(number, PAYMENT.multicaixa);
  await sendWhatsAppMessage(number, `👤 *Titular:* ${PAYMENT.titular}`);
  await sendWhatsAppMessage(number, 'Quando fizeres o pagamento, envia o comprovativo em PDF por aqui. 😊');
}

module.exports = {
  httpsAgent,
  sendWhatsAppMessage,
  sendCredentialsEmail,
  sendPaymentMessages,
};
