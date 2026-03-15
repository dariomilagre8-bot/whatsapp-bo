/**
 * Módulo WhatsApp — Evolution API only.
 * O bot não usa cliente local (whatsapp-web.js/baileys). Recebe eventos via POST /webhook
 * e envia mensagens via Evolution API (waha.js).
 */
import { config } from './config.js';
import * as waha from './waha.js';

/** No-op: não há cliente local a inicializar. */
export function init() {
  console.log('[WhatsApp] Modo Evolution API — sem cliente local. Mensagens via webhook.');
}

/** Sem cliente local: não há QR gerado por esta app. Usar /qr-evolution para Evolution API. */
export function get_qr() {
  return null;
}

/**
 * Estado de conexão. Para refletir Evolution API, use waha.get_status() (async) no /health e /qr.
 */
export function get_status() {
  return { ready: false, has_qr: false };
}

/** Envia texto via Evolution API. */
export async function send_text(to, text) {
  await waha.send_text(to, text);
}

/**
 * Notifica TODOS os supervisores (lista em config.bot.supervisores).
 * Cada número é enviado como só dígitos (Evolution API usa @s.whatsapp.net internamente).
 * Usar para: comprovativos, novas vendas, reclamações, erros.
 */
export async function notifyAllSupervisors(message) {
  const list = config.bot?.supervisores || [];
  if (list.length === 0) {
    const fallback = config.bot?.supervisorNumero;
    if (fallback) {
      const num = String(fallback).replace(/\D/g, '');
      if (num) list.push(num);
    }
  }
  if (list.length === 0) {
    console.warn('[WhatsApp] Nenhum supervisor configurado (SUPERVISOR_NUMBERS ou SUPERVISOR_NUMERO) — notificação ignorada.');
    return;
  }
  for (const raw of list) {
    const number = String(raw).replace(/\D/g, '');
    if (!number) continue;
    try {
      await waha.send_text(number, message);
      console.log(`[WhatsApp] 📨 Notificação enviada para supervisor ${number}`);
    } catch (err) {
      console.warn(`[WhatsApp] Falha ao notificar supervisor ${number}:`, err.message);
    }
  }
}

/**
 * Notifica um único supervisor (retrocompatibilidade). Preferir notifyAllSupervisors para notificações passivas.
 */
export async function notify_supervisor(message) {
  await notifyAllSupervisors(message);
}
