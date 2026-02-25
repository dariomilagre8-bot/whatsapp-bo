// GET /qr — página de scan remoto Evolution API
const express = require('express');
const axios = require('axios');
const branding = require('../../branding');
const { httpsAgent } = require('../whatsapp');

const router = express.Router();

router.get('/qr', async (req, res) => {
  try {
    const instanceName = encodeURIComponent(process.env.EVOLUTION_INSTANCE_NAME || '');
    const r = await axios.get(
      `${process.env.EVOLUTION_API_URL}/instance/connect/${instanceName}`,
      { headers: { apikey: process.env.EVOLUTION_API_KEY }, httpsAgent }
    );
    const base64 = r.data?.base64 || '';
    const pairingCode = r.data?.pairingCode || '';
    res.send(`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ligar WhatsApp — ${branding.nome}</title>
  <style>
    body{background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:sans-serif;color:#fff;text-align:center;padding:16px}
    h2{color:#25D366;margin-bottom:4px;font-size:1.2rem}
    p{color:#aaa;font-size:.85rem;margin:0 0 16px}
    img{border:5px solid #25D366;border-radius:10px;width:260px;height:260px;display:block}
    .code{font-size:2rem;font-weight:bold;letter-spacing:6px;color:#25D366;margin:12px 0}
    small{color:#555;font-size:.7rem;margin-top:12px}
  </style>
  <meta http-equiv="refresh" content="55">
</head>
<body>
  <h2>📱 ${branding.nome} — Ligar WhatsApp</h2>
  <p>Abre o WhatsApp → Aparelhos Ligados → Ligar Aparelho</p>
  ${base64 ? `<img src="${base64}" alt="QR Code" />` : '<p style="color:#e55">QR indisponível</p>'}
  ${pairingCode ? `<p style="margin-top:16px;color:#aaa;font-size:.85rem">Ou usa o código:</p><div class="code">${pairingCode}</div>` : ''}
  <small>Página actualiza automaticamente a cada 55s</small>
</body>
</html>`);
  } catch (e) {
    res.status(500).send(`<h2 style="color:red;font-family:sans-serif">Erro ao gerar QR: ${e.message}</h2>`);
  }
});

module.exports = router;
