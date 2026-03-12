/**
 * TestOrchestrator — Máquina de estados do fluxo de QA.
 * Estados: INICIANDO → TESTANDO → AVALIANDO → CONCLUIDO | FALHA_CRITICA
 */
import type { TestSession, TestState } from '../types/index.js';
import type { IClaudeService } from '../services/claude.service.js';
import type { ITelegramService } from '../services/telegram.service.js';
import type { IWhatsAppService } from '../services/whatsapp.service.js';
import type { ISupabaseService } from '../services/supabase.service.js';
import type { INotionService } from '../services/notion.service.js';
export interface OrchestratorDependencies {
    claude: IClaudeService;
    telegram: ITelegramService;
    whatsapp: IWhatsAppService;
    supabase: ISupabaseService;
    notion: INotionService;
}
export declare class TestOrchestrator {
    private readonly deps;
    private readonly sessions;
    private timeoutHandles;
    private readonly telegramAdminChatIds;
    constructor(deps: OrchestratorDependencies, telegramAdminChatIds?: string[]);
    /** Inicia uma nova sessão de teste. Trigger: /testar_bot [numero_whatsapp] [tipo_bot] */
    startTest(targetWhatsApp: string, tipoBot: string, regrasNegocio?: string[]): Promise<TestSession>;
    /** Chamado quando uma mensagem é recebida do WhatsApp (do bot alvo). */
    onTargetMessage(from: string, text: string): Promise<void>;
    /** Notifica orquestrador de que o WhatsApp desconectou — pausa e alerta. */
    onWhatsAppDisconnected(): void;
    getSession(sessionId: string): TestSession | undefined;
    getSessionsByState(state: TestState): TestSession[];
    private transition;
    private appendTurn;
    private findSessionByTarget;
    private buildContext;
    private tryParseFinalResult;
    private isValidTestResult;
    private finishTest;
    private scheduleTimeout;
    private resetTimeout;
    private clearTimeout;
    private normalizePhone;
    private notifyAdmins;
}
//# sourceMappingURL=test.orchestrator.d.ts.map