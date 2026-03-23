/**
 * Palanca AI — Entrypoint
 * Inicia Telegram (/testar_bot), WhatsApp (QR no terminal), Claude, Supabase, Notion e Orquestrador.
 * Servidor HTTP de health check para Easypanel/Docker (GET /health).
 */

import 'dotenv/config';
import http from 'node:http';
import { TestOrchestrator } from './orchestrator/test.orchestrator.js';
import type { OrchestratorDependencies } from './orchestrator/test.orchestrator.js';
import { config } from './config/index.js';
import { ClaudeService } from './services/claude.service.js';
import { TelegramService } from './services/telegram.service.js';
import { WhatsAppService } from './services/whatsapp.service.js';
import { SupabaseService } from './services/supabase.service.js';
import { NotionService } from './services/notion.service.js';

const adminChatIds = (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const telegram = new TelegramService(adminChatIds.length > 0 ? adminChatIds : undefined);
const whatsapp = new WhatsAppService(process.env.WA_SESSION_PATH);
const claude = new ClaudeService();
const supabase = new SupabaseService();
const notion = new NotionService();

const deps: OrchestratorDependencies = {
  claude,
  telegram,
  whatsapp,
  supabase,
  notion,
};

const orchestrator = new TestOrchestrator(deps, adminChatIds);

// --- Health Check Server (Easypanel / Docker) ---
const PORT = Number(process.env.PORT) || 3000;
const healthServer = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'Palanca AI QA Automations is RUNNING',
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }
  res.writeHead(404);
  res.end();
});
healthServer.listen(PORT, () => {
  console.log(`[Palanca AI] Health check server listening on port ${PORT}`);
});

telegram.onCommand('testar_bot', async (msg, args) => {
  const [targetWhatsApp, tipoBot] = args;
  if (!targetWhatsApp || !tipoBot) {
    const chatId = msg.chat?.id;
    if (chatId != null) {
      await telegram.sendAlert(chatId, 'Uso: /testar_bot [numero_whatsapp_alvo] [tipo_de_bot]');
    }
    return;
  }
  try {
    const session = await orchestrator.startTest(targetWhatsApp, tipoBot);
    await telegram.sendAdminAlert(
      `Teste iniciado: ${session.id}\nAlvo: ${session.targetWhatsApp}\nBot: ${session.botContext.tipoBot}`
    );
  } catch (err) {
    await telegram.sendAdminAlert(
      `Erro ao iniciar teste: ${err instanceof Error ? err.message : String(err)}`
    );
  }
});

whatsapp.onMessage((from, text) => {
  orchestrator.onTargetMessage(from, text).catch((err) => {
    console.error('[Palanca AI] Erro ao processar mensagem do alvo:', err);
  });
});

whatsapp.setDisconnectCallback(() => {
  orchestrator.onWhatsAppDisconnected();
});

async function main(): Promise<void> {
  await whatsapp.start();
  console.log('Palanca AI em execução. Envia /testar_bot [numero] [tipo_de_bot] no Telegram.');
}

main().catch((err) => {
  console.error('Falha ao iniciar Palanca AI:', err);
  process.exit(1);
});

export { orchestrator, config };
