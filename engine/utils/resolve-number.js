'use strict';

// engine/utils/resolve-number.js
// Resolve remoteJid que pode vir como LID (@lid) para o número real do WhatsApp.

const { extractPhoneNumber, normalizePhone } = require('../../src/utils/phone');
const { getRedis } = require('../lib/dedup');

const LID_REGEX = /^(\d+)@lid$/i;
const NONJID_NUMBERS_REGEX = /\D/g;

// 30 dias (cache para reduzir chamadas Evolution API)
const LID_CACHE_TTL_SEC = 60 * 60 * 24 * 30;

// Fallback quando Redis não está configurado
const memoryCache = new Map(); // key -> { value, exp }

function digitsOnly(value) {
  return String(value || '').replace(NONJID_NUMBERS_REGEX, '');
}

/**
 * @param {string} remoteJid ex: "244922232215@s.whatsapp.net" | "251371634868240@lid" | "244922232215"
 * @returns {{ number: string, isLid: boolean, rawJid: string }}
 */
function parseJid(remoteJid) {
  const raw = remoteJid == null ? '' : String(remoteJid);
  if (!raw) return { number: '', isLid: false, rawJid: '' };

  const lidMatch = raw.match(LID_REGEX);
  if (lidMatch) {
    return { number: lidMatch[1], isLid: true, rawJid: raw };
  }

  // Caso normal (já vem como número/JID)
  const number = digitsOnly(raw);
  return { number, isLid: false, rawJid: raw };
}

function getMemoryCached(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.exp < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setMemoryCached(key, value) {
  memoryCache.set(key, { value, exp: Date.now() + LID_CACHE_TTL_SEC * 1000 });
}

async function findContacts(evolutionConfig, instanceName, queryNumber) {
  const { apiUrl, apiKey } = evolutionConfig || {};
  if (!apiUrl || !apiKey || !instanceName) return null;

  const url = `${apiUrl.replace(/\/$/, '')}/chat/findContacts/${instanceName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({ where: { id: queryNumber } }),
  });

  if (!res.ok) {
    return null;
  }

  const json = await res.json().catch(() => null);
  if (!json) return null;

  // Suporta variações de formato (depends do Evolution API)
  const contacts = Array.isArray(json) ? json : (json?.data || json?.contacts || []);
  if (!Array.isArray(contacts)) return null;
  return contacts;
}

/**
 * @param {string} remoteJid
 * @param {string} instanceName Evolution instanceName (ex: demo-moda, demo-moda, Streamzone Braulio...)
 * @param {object} evolutionConfig { apiUrl, apiKey }
 * @param {object} logger opcional (createLogger)
 * @returns {Promise<string>} número resolvido (ex: "244922232215") ou fallback (ex: LID digits)
 */
async function resolveNumber(remoteJid, instanceName, evolutionConfig, logger = null) {
  const parsed = parseJid(remoteJid);

  if (!parsed.number) return '';

  // Não é LID: apenas normaliza/retorna.
  if (!parsed.isLid) {
    const raw = extractPhoneNumber(parsed.number) || digitsOnly(parsed.number);
    const out = normalizePhone(raw) || raw || '';
    return out;
  }

  const lid = parsed.number;
  const cacheKey = `lid_map:${lid}`;

  // 1) Redis (quando disponível)
  const r = getRedis();
  if (r) {
    try {
      const cached = await r.get(cacheKey);
      if (cached) return String(cached);
    } catch (err) {
      logger?.warn?.(`[resolve-number] Redis get falhou: ${err.message}`);
    }
  } else {
    const cached = getMemoryCached(cacheKey);
    if (cached) return cached;
  }

  // 2) Evolution API
  try {
    const contacts = await findContacts(evolutionConfig, instanceName, lid);
    if (contacts && contacts.length > 0) {
      const c = contacts[0] || {};
      const rawId = c.id || c.jid || c.remoteJid || c.number || '';
      const resolved = extractPhoneNumber(String(rawId)) || digitsOnly(rawId) || '';

      if (resolved) {
        const normalized = normalizePhone(resolved) || resolved;
        // Guardar no cache
        if (r) {
          try {
            await r.set(cacheKey, normalized, 'EX', LID_CACHE_TTL_SEC);
          } catch (_) {}
        } else {
          setMemoryCached(cacheKey, normalized);
        }
        logger?.info?.(`[resolve-number] LID ${lid} -> ${normalized} (API)`);
        return normalized;
      }
    }
  } catch (err) {
    logger?.warn?.(`[resolve-number] findContacts falhou: ${err.message}`);
  }

  logger?.warn?.(`[resolve-number] LID ${lid} não resolvido — fallback usando LID digits`);
  return lid;
}

module.exports = {
  parseJid,
  resolveNumber,
};

