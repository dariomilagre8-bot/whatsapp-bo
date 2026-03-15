import { readFileSync } from 'fs';
import { resolve } from 'path';
import 'dotenv/config';

function load_system_prompt() {
  let raw;
  try {
    const path = process.env.SYSTEM_PROMPT_PATH || resolve(process.cwd(), 'prompts/luna-base.txt');
    raw = readFileSync(path, 'utf-8').trim();
  } catch {
    try {
      raw = readFileSync(resolve(process.cwd(), 'system_prompt.txt'), 'utf-8').trim();
    } catch {
      throw new Error('Prompt não encontrado. Verifica prompts/luna-base.txt ou SYSTEM_PROMPT_PATH.');
    }
  }
  // Substituir placeholders para evitar [EMPRESA] literal nas mensagens
  return raw
    .replace(/\[EMPRESA\]/g, process.env.BOT_EMPRESA || 'Palanca Automações')
    .replace(/\[BOT_NOME\]/g, process.env.BOT_NOME || 'Luna')
    .replace(/\[BOT_NUMERO\]/g, process.env.BOT_NUMERO || '351934937617');
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Identidade do bot (configurável por cliente via .env)
  // Supervisores: SUPERVISOR_NUMBERS (lista vírgula) ou SUPERVISOR_NUMERO/SUPERVISOR_PHONE (único)
  bot: {
    nome: process.env.BOT_NOME || 'Luna',
    empresa: process.env.BOT_EMPRESA || 'Palanca Automações',
    numero: process.env.BOT_NUMERO || '351934937617',
    supervisorNumero: process.env.SUPERVISOR_NUMERO || process.env.SUPERVISOR_PHONE,
    /** Lista de números de supervisores (só dígitos, sem + ou espaços). Fonte única para comandos # e notificações. */
    supervisores: (process.env.SUPERVISOR_NUMBERS || process.env.SUPERVISOR_NUMERO || process.env.SUPERVISOR_PHONE || '')
      .split(',')
      .map((s) => String(s || '').replace(/\D/g, '').trim())
      .filter(Boolean),
    adminSecret: process.env.ADMIN_SECRET,
  },

  // Serviços da empresa cliente (JSON array no .env)
  servicos: JSON.parse(process.env.SERVICOS || '[]'),

  supabase: {
    url: (process.env.SUPABASE_URL || '').trim(),
    key: (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim(),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    sessionTtlSeconds: parseInt(process.env.REDIS_SESSION_TTL || '3600', 10),
    maxHistoryMessages: parseInt(process.env.MAX_HISTORY_MESSAGES || '10', 10),
  },

  ai: {
    provider: process.env.AI_PROVIDER || 'gemini',
    model: process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-2.5-flash',
    geminiApiKey: process.env.GEMINI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    maxOutputTokens: parseInt(process.env.AI_MAX_TOKENS || '1024', 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
  },

  // Evolution API (WhatsApp — usada pelo webhook; multi-cliente: uma instância por .env)
  evolution: {
    url: process.env.EVOLUTION_API_URL,
    key: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE_NAME,
  },

  systemPrompt: load_system_prompt(),
};
