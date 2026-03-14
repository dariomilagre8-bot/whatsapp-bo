// src/routes/connect-braulio.js — Página QR Code para ligar WhatsApp do Bráulio (instância Streamzone Braulio)
// Protegido por token: /connect/braulio?token=...

const CONNECT_TOKEN = process.env.CONNECT_TOKEN || 'streamzone2026';
const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const BRAULIO_INSTANCE = 'Streamzone Braulio';

function parseApiData(data) {
  const hasOpen = data.instance && (data.instance.state === 'open' || data.instance.state === 'connected');
  const base64 = (data.base64 || data.base64Image || (data.qrcode && data.qrcode.base64)) || '';
  const pairingCode = (data.pairingCode || (data.qrcode && data.qrcode.pairingCode)) || '';
  const codeRaw = data.code || (data.qrcode && data.qrcode.code) || '';
  const isCodeQrPayload = codeRaw.length > 30 || (codeRaw && (codeRaw.includes('@') || codeRaw.startsWith('2@')));
  const shortCode = !isCodeQrPayload && codeRaw ? codeRaw : pairingCode;
  return {
    alreadyConnected: hasOpen,
    base64: base64.startsWith('data:') ? base64 : (base64 ? `data:image/png;base64,${base64}` : ''),
    pairingCode: typeof pairingCode === 'string' ? pairingCode : '',
    qrPayload: isCodeQrPayload ? codeRaw : '',
    shortCode: typeof shortCode === 'string' ? shortCode : '',
  };
}

function buildQrPage(parsed, currentUrl) {
  const { base64, pairingCode, qrPayload, shortCode } = parsed;
  const code = shortCode || pairingCode;
  const codeWithSpaces = (code || '').toString().split('').join(' ');
  const instruction = 'Abre o WhatsApp → Dispositivos Ligados → Liga um dispositivo → aponta ao QR';

  if (qrPayload) {
    const payloadEscaped = JSON.stringify(qrPayload);
    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>Ligar WhatsApp — Bráulio</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #0a0a0a; color: #fff; font-family: sans-serif; margin: 0; padding: 2rem; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    h1 { font-size: 1.25rem; font-weight: normal; margin: 0 0 1rem; }
    .instruction { margin-bottom: 1.5rem; max-width: 320px; text-align: center; line-height: 1.5; color: #ccc; }
    .qr { margin: 1rem 0; }
    #qrcode canvas, #qrcode img { border: 2px solid #333; border-radius: 8px; }
    .code { font-size: 1.75rem; letter-spacing: 0.35em; font-weight: bold; margin: 1rem 0; word-break: break-all; }
    .btn { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #00d26a; color: #0a0a0a; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #00b858; }
    .warn { margin-top: 1rem; color: #888; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Ligar WhatsApp (Bráulio)</h1>
  <p class="instruction">${instruction}</p>
  <div class="qr"><div id="qrcode"></div></div>
  ${code ? `<div class="code" aria-label="Código">${codeWithSpaces}</div>` : ''}
  <a href="${currentUrl}" class="btn">Atualizar QR</a>
  <p class="warn">O QR expira em breve. A página actualiza a cada 30 segundos.</p>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js"></script>
  <script>
    (function(){
      var el = document.getElementById("qrcode");
      var text = ${payloadEscaped};
      if (typeof QRCode !== "undefined" && el && text) {
        new QRCode(el, { text: text, width: 256, height: 256 });
      }
    })();
  </script>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>Ligar WhatsApp — Bráulio</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #0a0a0a; color: #fff; font-family: sans-serif; margin: 0; padding: 2rem; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    h1 { font-size: 1.25rem; font-weight: normal; margin: 0 0 1rem; }
    .instruction { margin-bottom: 1.5rem; max-width: 320px; text-align: center; line-height: 1.5; color: #ccc; }
    .qr { margin: 1rem 0; }
    .qr img { max-width: 280px; height: auto; border: 2px solid #333; border-radius: 8px; }
    .code { font-size: 1.75rem; letter-spacing: 0.35em; font-weight: bold; margin: 1rem 0; word-break: break-all; }
    .btn { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #00d26a; color: #0a0a0a; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #00b858; }
    .warn { margin-top: 1rem; color: #888; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Ligar WhatsApp (Bráulio)</h1>
  <p class="instruction">${instruction}</p>
  <div class="qr">${base64 ? `<img src="${base64}" alt="QR Code">` : (code ? '<p>(Use o código abaixo no WhatsApp)</p>' : '')}</div>
  ${code ? `<div class="code" aria-label="Código">${codeWithSpaces}</div>` : ''}
  <a href="${currentUrl}" class="btn">Atualizar QR</a>
  <p class="warn">O QR expira em breve. A página actualiza a cada 30 segundos.</p>
</body>
</html>`;
}

function buildAlreadyConnectedPage(currentUrl) {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ligar WhatsApp — Bráulio</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #0a0a0a; color: #fff; font-family: sans-serif; margin: 0; padding: 2rem; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .status-ok { color: #00d26a; font-size: 1.5rem; font-weight: bold; margin: 1rem 0; }
    .subtitle { color: #ccc; max-width: 320px; text-align: center; line-height: 1.5; margin-bottom: 1rem; }
    .btn { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #00d26a; color: #0a0a0a; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #00b858; }
  </style>
</head>
<body>
  <p class="status-ok">✅ Instância já conectada</p>
  <p class="subtitle">O WhatsApp do Bráulio está activo. Não é necessário fazer scan.</p>
  <a href="${currentUrl}" class="btn">Atualizar</a>
</body>
</html>`;
}

function buildErrorPage(message, currentUrl) {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Erro — Bráulio</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #0a0a0a; color: #fff; font-family: sans-serif; margin: 0; padding: 2rem; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .status-err { color: #e74c3c; font-size: 1.25rem; margin: 1rem 0; }
    .subtitle { color: #ccc; max-width: 320px; text-align: center; line-height: 1.5; margin-bottom: 1rem; }
    .btn { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #00d26a; color: #0a0a0a; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #00b858; }
  </style>
</head>
<body>
  <p class="status-err">⚠️ ${message}</p>
  <a href="${currentUrl}" class="btn">Tentar de novo</a>
</body>
</html>`;
}

async function connectBraulioHandler(req, res) {
  const token = req.query.token;
  if (token !== CONNECT_TOKEN) {
    res.status(403).setHeader('Content-Type', 'text/html; charset=utf-8').send(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Acesso negado</title></head>' +
      '<body style="font-family:sans-serif;padding:2rem;text-align:center;"><h1>Acesso negado</h1><p>Token inválido ou em falta.</p></body></html>'
    );
    return;
  }

  const currentUrl = `${req.protocol}://${req.get('host') || req.hostname}${req.path}?token=${encodeURIComponent(token)}`;

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(
      buildErrorPage('Configuração em falta: EVOLUTION_API_URL ou EVOLUTION_API_KEY.', currentUrl)
    );
    return;
  }

  const url = `${EVOLUTION_API_URL}/instance/connect/${encodeURIComponent(BRAULIO_INSTANCE)}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: EVOLUTION_API_KEY },
    });

    if (!response.ok) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8').status(response.status).send(
        buildErrorPage('Erro ao obter QR Code da Evolution API. Verifique se a instância "' + BRAULIO_INSTANCE + '" existe.', currentUrl)
      );
      return;
    }

    const data = await response.json();
    const parsed = parseApiData(data);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (parsed.alreadyConnected) {
      res.send(buildAlreadyConnectedPage(currentUrl));
      return;
    }
    if (parsed.base64 || parsed.qrPayload || parsed.shortCode || parsed.pairingCode) {
      res.send(buildQrPage(parsed, currentUrl));
      return;
    }
    res.send(buildAlreadyConnectedPage(currentUrl));
  } catch (err) {
    console.error('[CONNECT-BRAULIO]', err.message);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').send(
      buildErrorPage('Não foi possível contactar a Evolution API.', currentUrl)
    );
  }
}

module.exports = { connectBraulioHandler };
