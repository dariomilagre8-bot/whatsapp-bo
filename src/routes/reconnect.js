// src/routes/reconnect.js — Rota de reconexão com QR Code (Evolution API)
const RECONNECT_PASSWORD = process.env.RECONNECT_PASSWORD || 'streamzone2026';
const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

function denyHtml(res) {
  res.status(403).send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Acesso negado</title></head>' +
    '<body style="font-family:sans-serif;padding:2rem;text-align:center;"><h1>Acesso negado</h1></body></html>'
  );
}

function buildPage(data) {
  const { base64, code } = data;
  const displayCode = (code || '').toString();
  const codeWithSpaces = displayCode.split('').join(' ');

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StreamZone Connect — Reconexão</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #0a0a0a; color: #fff; font-family: sans-serif; margin: 0; padding: 2rem; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .logo { color: #00d26a; font-size: 1.5rem; font-weight: bold; margin-bottom: 1.5rem; }
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
  <div class="logo">StreamZone</div>
  <h1>Reconexão</h1>
  <p class="instruction">Abra o WhatsApp &gt; Dispositivos vinculados &gt; Vincular um dispositivo</p>
  <div class="qr">${base64 ? `<img src="${base64}" alt="QR Code">` : (displayCode ? '<p>(Sem imagem QR — use o código abaixo)</p>' : '')}</div>
  ${displayCode ? `<div class="code" aria-label="Código">${codeWithSpaces}</div>` : ''}
  <a href="" class="btn">Actualizar QR Code</a>
  <p class="warn">Este QR Code expira em 60 segundos.</p>
  <script>
    setTimeout(function(){ window.location.reload(); }, 30000);
  </script>
</body>
</html>`;
}

function buildAlreadyConnectedPage() {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StreamZone Connect — Já conectado</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #0a0a0a; color: #fff; font-family: sans-serif; margin: 0; padding: 2rem; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .logo { color: #00d26a; font-size: 1.5rem; font-weight: bold; margin-bottom: 1.5rem; }
    .status-ok { color: #00d26a; font-size: 1.5rem; font-weight: bold; margin: 1rem 0; }
    .subtitle { color: #ccc; max-width: 320px; text-align: center; line-height: 1.5; margin-bottom: 1rem; }
    .btn { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #00d26a; color: #0a0a0a; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #00b858; }
  </style>
</head>
<body>
  <div class="logo">StreamZone</div>
  <p class="status-ok">✅ Instância já conectada</p>
  <p class="subtitle">O WhatsApp está activo e a funcionar. Não é necessário fazer scan.</p>
  <a href="" class="btn">Actualizar</a>
  <script>
    setTimeout(function(){ window.location.reload(); }, 30000);
  </script>
</body>
</html>`;
}

function buildApiErrorPage() {
  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StreamZone Connect — Erro</title>
  <style>
    * { box-sizing: border-box; }
    body { background: #0a0a0a; color: #fff; font-family: sans-serif; margin: 0; padding: 2rem; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .logo { color: #00d26a; font-size: 1.5rem; font-weight: bold; margin-bottom: 1.5rem; }
    .status-err { color: #e74c3c; font-size: 1.25rem; font-weight: bold; margin: 1rem 0; }
    .subtitle { color: #ccc; max-width: 320px; text-align: center; line-height: 1.5; margin-bottom: 1rem; }
    .btn { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #00d26a; color: #0a0a0a; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #00b858; }
  </style>
</head>
<body>
  <div class="logo">StreamZone</div>
  <p class="status-err">⚠️ Erro ao obter QR Code</p>
  <p class="subtitle">Verifique se a instância existe no servidor.</p>
  <a href="" class="btn">Actualizar</a>
</body>
</html>`;
}

async function reconnectHandler(req, res) {
  const pwd = req.query.pwd;
  if (pwd !== RECONNECT_PASSWORD) {
    return denyHtml(res);
  }

  const instanceId = req.params.instanceId;
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    res.status(500).send(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Erro</title></head>' +
      '<body style="font-family:sans-serif;padding:2rem;"><h1>Configuração em falta</h1><p>EVOLUTION_API_URL ou EVOLUTION_API_KEY não definidos.</p></body></html>'
    );
    return;
  }

  const url = `${EVOLUTION_API_URL}/instance/connect/${encodeURIComponent(instanceId)}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: EVOLUTION_API_KEY },
    });

    if (!response.ok) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(response.status).send(buildApiErrorPage());
      return;
    }

    const data = await response.json();
    const base64 = data.base64 || (data.base64Image || '');
    const code = data.code || data.pairingCode || '';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!base64 && !code) {
      res.send(buildAlreadyConnectedPage());
    } else {
      res.send(buildPage({ base64, code }));
    }
  } catch (err) {
    console.error('[RECONNECT]', err.message);
    res.status(500).send(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Erro</title></head>' +
      '<body style="font-family:sans-serif;padding:2rem;background:#0a0a0a;color:#fff;"><h1>Erro</h1><p>Não foi possível contactar a Evolution API.</p></body></html>'
    );
  }
}

module.exports = { reconnectHandler };
