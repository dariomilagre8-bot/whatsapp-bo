/**
 * Testes HTTP — health check e webhook (base URL via BASE_URL ou localhost)
 * Executar: node tests/webhook-test.js
 * Opcional: BASE_URL=https://whatssiru.46.224.99.52.nip.io node tests/webhook-test.js
 */
const http = require('http');
const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:80';
const url = new URL(BASE_URL);
const isHttps = url.protocol === 'https:';
const client = isHttps ? https : http;

let falhas = 0;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: path || '/',
      method: method || 'GET',
      timeout: 10000,
    };
    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', (ch) => (data += ch));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('Base URL:', BASE_URL);

  // Health check
  try {
    const r = await request('GET', '/health');
    if (r.status !== 200) {
      console.log('❌ GET /health status:', r.status);
      falhas++;
    } else {
      let obj;
      try { obj = JSON.parse(r.data); } catch (_) { obj = {}; }
      if (obj.status !== 'ok') {
        console.log('❌ GET /health body.status !== ok');
        falhas++;
      } else {
        console.log('✅ GET /health 200, status=ok, uptime=', obj.uptime);
      }
    }
  } catch (e) {
    console.log('❌ GET /health erro:', e.message);
    falhas++;
  }

  // Webhook POST (payload inválido não deve crashar — 200 OK)
  try {
    const r = await request('POST', '/', JSON.stringify({ event: 'other' }));
    if (r.status !== 200) {
      console.log('❌ POST / (event other) status:', r.status, '— esperado 200');
      falhas++;
    } else {
      console.log('✅ POST / payload inválido → 200');
    }
  } catch (e) {
    console.log('❌ POST / erro:', e.message);
    falhas++;
  }

  try {
    const r = await request('POST', '/', JSON.stringify({
      event: 'messages.upsert',
      data: { key: { fromMe: true } },
    }));
    if (r.status !== 200) {
      console.log('❌ POST / (fromMe) status:', r.status);
      falhas++;
    } else {
      console.log('✅ POST / fromMe → 200');
    }
  } catch (e) {
    console.log('❌ POST / fromMe erro:', e.message);
    falhas++;
  }

  console.log(falhas === 0 ? '\n✅ Testes HTTP OK.' : '\n❌ ' + falhas + ' falha(s).');
  process.exit(falhas > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
