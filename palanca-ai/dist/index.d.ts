/**
 * Palanca AI — Entrypoint
 * Inicia Telegram (/testar_bot), WhatsApp (QR no terminal), Claude, Supabase, Notion e Orquestrador.
 * Servidor HTTP de health check para Easypanel/Docker (GET /health).
 */
import 'dotenv/config';
import { TestOrchestrator } from './orchestrator/test.orchestrator.js';
import { config } from './config/index.js';
declare const orchestrator: TestOrchestrator;
export { orchestrator, config };
//# sourceMappingURL=index.d.ts.map