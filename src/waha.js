import axios from 'axios';
import { config } from './config.js';

const evo = config.evolution;
if (!evo?.url || !evo?.instance) {
  throw new Error('Evolution API não configurada: define EVOLUTION_API_URL e EVOLUTION_INSTANCE_NAME no .env');
}

const baseURL = evo.url.replace(/\/$/, '');
const client = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    apikey: evo.key,
  },
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    console.log('[Evolution] Status:', err.response?.status);
    console.log('[Evolution] Response data:', JSON.stringify(err.response?.data));
    console.log('[Evolution] Request URL:', err.config?.url);
    const headers = err.config?.headers ? { ...err.config.headers, apikey: err.config.headers.apikey ? '[REDACTED]' : undefined } : {};
    console.log('[Evolution] Request headers:', JSON.stringify(headers));
    const msg = err.response?.data?.message || err.message;
    console.error(`[Evolution] Erro na API: ${msg}`);
    return Promise.reject(err);
  }
);

/** Número só com dígitos (código país + número). Evolution API espera "number" assim; usa @s.whatsapp.net internamente. */
export function formatNumberForEvolution(raw) {
  if (!raw) return '';
  return String(raw).replace(/\D/g, '');
}

/** Envia texto via Evolution API v2.3.0: POST /message/sendText/{instanceName} */
export async function send_text(to, text) {
  const number = formatNumberForEvolution(to);
  if (!number) {
    console.warn('[Evolution] send_text ignorado: número vazio após normalização. to=', String(to).slice(0, 30));
    return;
  }
  const url = `/message/sendText/${evo.instance}`;
  try {
    await client.request({
      method: 'POST',
      url,
      data: { number, text },
    });
    console.log(`[Evolution] ✅ Enviado para ${number} (@s.whatsapp.net)`);
  } catch (err) {
    console.error(`[Evolution] ❌ Falha ao enviar para ${number}:`, err.response?.data?.message || err.message);
    throw err;
  }
}

/** Indicador "a escrever..." — desactivado: endpoint /chat/sendTyping não existe na Evolution API v2.3.0 */
export async function send_typing(_to, _duration_ms = 2000) {
  return;
}

/** Estado da instância (Evolution: connectionState ou fetchInstances) */
export async function get_status() {
  try {
    const res = await client.get(`/instance/connectionState/${evo.instance}`);
    const state = res.data?.state ?? res.data?.instance?.state;
    return {
      ready: state === 'open' || state === 'connected',
      has_qr: state === 'qr' || state === 'pairing',
      state,
    };
  } catch {
    return { ready: false, has_qr: false, state: 'unknown' };
  }
}

