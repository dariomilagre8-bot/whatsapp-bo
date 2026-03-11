/**
 * TestOrchestrator — Máquina de estados do fluxo de QA.
 * Estados: INICIANDO → TESTANDO → AVALIANDO → CONCLUIDO | FALHA_CRITICA
 */

import type { BotContext, ConversationTurn, TestAuditLog, TestResult, TestSession, TestState } from '../types/index.js';
import { config } from '../config/index.js';
import type { IClaudeService } from '../services/claude.service.js';
import type { ITelegramService } from '../services/telegram.service.js';
import type { IWhatsAppService } from '../services/whatsapp.service.js';
import type { ISupabaseService } from '../services/supabase.service.js';
import type { INotionService } from '../services/notion.service.js';

const TEST_RESULT_JSON_REGEX = /\{[\s\S]*"status"\s*:\s*"(?:APROVADO|REPROVADO)"[\s\S]*\}/;

export interface OrchestratorDependencies {
  claude: IClaudeService;
  telegram: ITelegramService;
  whatsapp: IWhatsAppService;
  supabase: ISupabaseService;
  notion: INotionService;
}

export class TestOrchestrator {
  private readonly sessions = new Map<string, TestSession>();
  private timeoutHandles = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly telegramAdminChatIds: string[];

  constructor(
    private readonly deps: OrchestratorDependencies,
    telegramAdminChatIds: string[] = []
  ) {
    this.telegramAdminChatIds = telegramAdminChatIds.length > 0
      ? telegramAdminChatIds
      : (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? '').split(',').filter(Boolean);
  }

  /** Inicia uma nova sessão de teste. Trigger: /testar_bot [numero_whatsapp] [tipo_bot] */
  async startTest(targetWhatsApp: string, tipoBot: string, regrasNegocio?: string[]): Promise<TestSession> {
    const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const session: TestSession = {
      id,
      targetWhatsApp: this.normalizePhone(targetWhatsApp),
      botContext: { tipoBot, regrasNegocio },
      state: 'INICIANDO',
      startedAt: new Date(),
      conversationLog: [],
    };
    this.sessions.set(id, session);
    this.scheduleTimeout(id);
    this.transition(id, 'TESTANDO');

    if (!this.deps.whatsapp.isConnected()) {
      this.transition(id, 'FALHA_CRITICA');
      await this.notifyAdmins(`⚠️ Palanca AI: Teste ${id} falhou — WhatsApp desconectado. Reconecte e tente novamente.`);
      throw new Error('WhatsApp desconectado');
    }

    const contextForClaude = this.buildContext(session);
    const firstMessage = await (this.deps.claude.getNextMessage as (ctx: unknown, log: ConversationTurn[]) => Promise<string>)(
      contextForClaude,
      session.conversationLog
    );
    this.appendTurn(session, 'assistant', firstMessage);
    await this.deps.whatsapp.sendMessage(session.targetWhatsApp, firstMessage);

    return session;
  }

  /** Chamado quando uma mensagem é recebida do WhatsApp (do bot alvo). */
  async onTargetMessage(from: string, text: string): Promise<void> {
    const session = this.findSessionByTarget(this.normalizePhone(from));
    if (!session || session.state !== 'TESTANDO') return;

    this.appendTurn(session, 'user', text);
    this.resetTimeout(session.id);

    const contextForClaude = this.buildContext(session);
    const next = await (this.deps.claude.getNextMessage as (ctx: unknown, log: ConversationTurn[]) => Promise<string>)(
      contextForClaude,
      session.conversationLog
    );

    const parsed = this.tryParseFinalResult(next);
    if (parsed) {
      this.transition(session.id, 'AVALIANDO');
      await this.finishTest(session.id, parsed);
      return;
    }

    this.appendTurn(session, 'assistant', next);
    await this.deps.whatsapp.sendMessage(session.targetWhatsApp, next);

    const turnCount = session.conversationLog.filter(t => t.role === 'assistant').length;
    if (turnCount >= config.test.maxTurns) {
      const evaluation = await (this.deps.claude.evaluateSession as (ctx: unknown, log: ConversationTurn[]) => Promise<unknown>)(
        contextForClaude,
        session.conversationLog
      ) as TestResult | null;
      if (evaluation && this.isValidTestResult(evaluation)) {
        this.transition(session.id, 'AVALIANDO');
        await this.finishTest(session.id, evaluation);
      }
    }
  }

  /** Notifica orquestrador de que o WhatsApp desconectou — pausa e alerta. */
  onWhatsAppDisconnected(): void {
    for (const [id, session] of this.sessions) {
      if (session.state === 'TESTANDO' || session.state === 'INICIANDO') {
        this.transition(id, 'FALHA_CRITICA');
        this.clearTimeout(id);
        this.notifyAdmins(
          `⚠️ Palanca AI: Teste ${id} (${session.targetWhatsApp}) pausado — WhatsApp desconectou. Reconecte para continuar.`
        );
      }
    }
  }

  getSession(sessionId: string): TestSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionsByState(state: TestState): TestSession[] {
    return [...this.sessions.values()].filter(s => s.state === state);
  }

  private transition(sessionId: string, newState: TestState): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.state = newState;
    if (newState === 'CONCLUIDO' || newState === 'FALHA_CRITICA') {
      this.clearTimeout(sessionId);
    }
  }

  private appendTurn(session: TestSession, role: 'assistant' | 'user', content: string): void {
    session.conversationLog.push({ role, content, timestamp: new Date() });
  }

  private findSessionByTarget(normalizedTarget: string): TestSession | undefined {
    return [...this.sessions.values()].find(
      s => s.state === 'TESTANDO' && s.targetWhatsApp === normalizedTarget
    );
  }

  private buildContext(session: TestSession): { botContext: BotContext; targetWhatsApp: string } {
    return {
      botContext: session.botContext,
      targetWhatsApp: session.targetWhatsApp,
    };
  }

  private tryParseFinalResult(text: string): TestResult | null {
    const match = text.match(TEST_RESULT_JSON_REGEX);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as TestResult;
      return this.isValidTestResult(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private isValidTestResult(obj: unknown): obj is TestResult {
    if (!obj || typeof obj !== 'object') return false;
    const o = obj as Record<string, unknown>;
    return (
      (o.status === 'APROVADO' || o.status === 'REPROVADO') &&
      Array.isArray(o.falhas) &&
      typeof o.relatorio_markdown === 'string' &&
      typeof o.metricas === 'object' && o.metricas !== null
    );
  }

  private async finishTest(sessionId: string, result: TestResult): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.transition(sessionId, 'CONCLUIDO');

    const auditLog: TestAuditLog = {
      sessionId,
      targetWhatsApp: session.targetWhatsApp,
      tipoBot: session.botContext.tipoBot,
      status: result.status,
      result,
      conversationLog: session.conversationLog,
      finishedAt: new Date().toISOString(),
    };

    try {
      await this.deps.supabase.saveAuditLog(auditLog);
    } catch (e) {
      await this.notifyAdmins(`Erro ao salvar no Supabase: ${String(e)}`);
    }

    try {
      const title = `[Palanca QA] ${session.botContext.tipoBot} - ${result.status} - ${sessionId}`;
      await this.deps.notion.createReportPage(title, result.relatorio_markdown, {
        sessionId,
        targetWhatsApp: session.targetWhatsApp,
        status: result.status,
      });
    } catch (e) {
      await this.notifyAdmins(`Erro ao criar página Notion: ${String(e)}`);
    }

    const summary = `Teste ${sessionId} concluído: ${result.status}\nFalhas: ${result.falhas.length}\nBot: ${session.botContext.tipoBot}`;
    await this.notifyAdmins(summary);
  }

  private scheduleTimeout(sessionId: string): void {
    this.clearTimeout(sessionId);
    const handle = setTimeout(() => {
      const session = this.sessions.get(sessionId);
      if (session && (session.state === 'TESTANDO' || session.state === 'INICIANDO')) {
        this.transition(sessionId, 'FALHA_CRITICA');
        this.notifyAdmins(
          `⏱️ Palanca AI: Teste ${sessionId} expirou (timeout ${config.test.sessionTimeoutMs}ms).`
        );
      }
    }, config.test.sessionTimeoutMs);
    this.timeoutHandles.set(sessionId, handle);
  }

  private resetTimeout(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && (session.state === 'TESTANDO' || session.state === 'INICIANDO')) {
      this.scheduleTimeout(sessionId);
    }
  }

  private clearTimeout(sessionId: string): void {
    const handle = this.timeoutHandles.get(sessionId);
    if (handle) {
      clearTimeout(handle);
      this.timeoutHandles.delete(sessionId);
    }
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').replace(/^0/, '');
  }

  private async notifyAdmins(message: string): Promise<void> {
    for (const chatId of this.telegramAdminChatIds) {
      try {
        await this.deps.telegram.sendAlert(chatId.trim(), message);
      } catch {
        // ignorar falha por chat
      }
    }
  }
}
