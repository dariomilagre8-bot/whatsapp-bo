/**
 * Configurações centralizadas — Palanca AI
 * Carrega variáveis de ambiente e expõe config tipada.
 */

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS ?? '4096', 10),
  },
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '',
  },
  notion: {
    apiKey: process.env.NOTION_API_KEY ?? '',
    parentPageId: process.env.NOTION_PARENT_PAGE_ID ?? '',
  },
  test: {
    sessionTimeoutMs: parseInt(process.env.TEST_SESSION_TIMEOUT_MS ?? '300000', 10), // 5 min
    maxTurns: parseInt(process.env.TEST_MAX_TURNS ?? '50', 10),
  },
} as const;
