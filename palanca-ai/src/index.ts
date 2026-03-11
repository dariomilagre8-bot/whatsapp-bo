/**
 * Palanca AI — Entrypoint
 * Inicia o bot Telegram (comando /testar_bot) e o orquestrador de testes.
 * Os serviços concretos (Claude, WhatsApp, Telegram, Supabase, Notion) devem ser
 * injetados no TestOrchestrator; este ficheiro usa stubs até à implementação real.
 */

import 'dotenv/config';
import { TestOrchestrator } from './orchestrator/test.orchestrator.js';
import type { OrchestratorDependencies } from './orchestrator/test.orchestrator.js';
import { config } from './config/index.js';

// Stubs: substituir por implementações reais na fase de serviços
const stubClaude: OrchestratorDependencies['claude'] = {
  async getNextMessage() {
    return 'Olá, sou o testador Palanca. Início do teste.';
  },
  async evaluateSession() {
    return {
      status: 'REPROVADO',
      metricas: {},
      falhas: ['Serviço Claude ainda não implementado'],
      relatorio_markdown: '# Stub\nNenhuma avaliação real.',
    };
  },
};

const stubTelegram: OrchestratorDependencies['telegram'] = {
  async sendAlert(_chatId, message) {
    console.log('[Telegram stub]', message);
  },
  onCommand(_command, _handler) {
    // Registo do handler será feito pela implementação real
  },
};

const stubWhatsApp: OrchestratorDependencies['whatsapp'] = {
  async sendMessage(to, text) {
    console.log('[WhatsApp stub] Enviar para', to, ':', text);
  },
  onMessage() {},
  isConnected() {
    return true;
  },
};

const stubSupabase: OrchestratorDependencies['supabase'] = {
  async saveAuditLog(log) {
    console.log('[Supabase stub] saveAuditLog', (log as { sessionId?: string }).sessionId);
  },
};

const stubNotion: OrchestratorDependencies['notion'] = {
  async createReportPage(title, _markdown) {
    console.log('[Notion stub] createReportPage', title);
    return `stub-page-${Date.now()}`;
  },
};

const deps: OrchestratorDependencies = {
  claude: stubClaude,
  telegram: stubTelegram,
  whatsapp: stubWhatsApp,
  supabase: stubSupabase,
  notion: stubNotion,
};

const adminChatIds = (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const orchestrator = new TestOrchestrator(deps, adminChatIds);

// Registo do comando /testar_bot (quando Telegram real estiver implementado, chamará isto)
function registerTestCommand(telegram: OrchestratorDependencies['telegram']): void {
  telegram.onCommand('testar_bot', async (_msg, args) => {
    const [targetWhatsApp, tipoBot] = args;
    if (!targetWhatsApp || !tipoBot) {
      await telegram.sendAlert(
        (adminChatIds[0] as string) ?? '',
        'Uso: /testar_bot [numero_whatsapp_alvo] [tipo_de_bot]'
      );
      return;
    }
    try {
      const session = await orchestrator.startTest(targetWhatsApp, tipoBot);
      await telegram.sendAlert(
        (adminChatIds[0] as string) ?? '',
        `Teste iniciado: ${session.id}\nAlvo: ${session.targetWhatsApp}\nBot: ${session.botContext.tipoBot}`
      );
    } catch (err) {
      await telegram.sendAlert(
        (adminChatIds[0] as string) ?? '',
        `Erro ao iniciar teste: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}

registerTestCommand(stubTelegram);

// Quando o WhatsApp real estiver implementado:
// - subscrever mensagens e chamar orchestrator.onTargetMessage(from, text)
// - subscrever desconexão e chamar orchestrator.onWhatsAppDisconnected()

console.log('Palanca AI iniciado (modo stub). Configure os serviços e envie /testar_bot no Telegram.');

export { orchestrator, config };
