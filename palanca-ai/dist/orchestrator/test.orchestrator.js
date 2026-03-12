/**
 * TestOrchestrator — Máquina de estados do fluxo de QA.
 * Estados: INICIANDO → TESTANDO → AVALIANDO → CONCLUIDO | FALHA_CRITICA
 */
import { config } from '../config/index.js';
const TEST_RESULT_JSON_REGEX = /\{[\s\S]*"status"\s*:\s*"(?:APROVADO|REPROVADO)"[\s\S]*\}/;
export class TestOrchestrator {
    deps;
    sessions = new Map();
    timeoutHandles = new Map();
    telegramAdminChatIds;
    constructor(deps, telegramAdminChatIds = []) {
        this.deps = deps;
        this.telegramAdminChatIds = telegramAdminChatIds.length > 0
            ? telegramAdminChatIds
            : (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? '').split(',').filter(Boolean);
    }
    /** Inicia uma nova sessão de teste. Trigger: /testar_bot [numero_whatsapp] [tipo_bot] */
    async startTest(targetWhatsApp, tipoBot, regrasNegocio) {
        const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const session = {
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
        const firstMessage = await this.deps.claude.getNextMessage(contextForClaude, session.conversationLog);
        this.appendTurn(session, 'assistant', firstMessage);
        await this.deps.whatsapp.sendMessage(session.targetWhatsApp, firstMessage);
        return session;
    }
    /** Chamado quando uma mensagem é recebida do WhatsApp (do bot alvo). */
    async onTargetMessage(from, text) {
        const session = this.findSessionByTarget(this.normalizePhone(from));
        if (!session || session.state !== 'TESTANDO')
            return;
        this.appendTurn(session, 'user', text);
        this.resetTimeout(session.id);
        const contextForClaude = this.buildContext(session);
        const next = await this.deps.claude.getNextMessage(contextForClaude, session.conversationLog);
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
            const evaluation = await this.deps.claude.evaluateSession(contextForClaude, session.conversationLog);
            if (evaluation && this.isValidTestResult(evaluation)) {
                this.transition(session.id, 'AVALIANDO');
                await this.finishTest(session.id, evaluation);
            }
        }
    }
    /** Notifica orquestrador de que o WhatsApp desconectou — pausa e alerta. */
    onWhatsAppDisconnected() {
        for (const [id, session] of this.sessions) {
            if (session.state === 'TESTANDO' || session.state === 'INICIANDO') {
                this.transition(id, 'FALHA_CRITICA');
                this.clearTimeout(id);
                this.notifyAdmins(`⚠️ Palanca AI: Teste ${id} (${session.targetWhatsApp}) pausado — WhatsApp desconectou. Reconecte para continuar.`);
            }
        }
    }
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    getSessionsByState(state) {
        return [...this.sessions.values()].filter(s => s.state === state);
    }
    transition(sessionId, newState) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.state = newState;
        if (newState === 'CONCLUIDO' || newState === 'FALHA_CRITICA') {
            this.clearTimeout(sessionId);
        }
    }
    appendTurn(session, role, content) {
        session.conversationLog.push({ role, content, timestamp: new Date() });
    }
    findSessionByTarget(normalizedTarget) {
        return [...this.sessions.values()].find(s => s.state === 'TESTANDO' && s.targetWhatsApp === normalizedTarget);
    }
    buildContext(session) {
        return {
            botContext: session.botContext,
            targetWhatsApp: session.targetWhatsApp,
        };
    }
    tryParseFinalResult(text) {
        const match = text.match(TEST_RESULT_JSON_REGEX);
        if (!match)
            return null;
        try {
            const parsed = JSON.parse(match[0]);
            return this.isValidTestResult(parsed) ? parsed : null;
        }
        catch {
            return null;
        }
    }
    isValidTestResult(obj) {
        if (!obj || typeof obj !== 'object')
            return false;
        const o = obj;
        return ((o.status === 'APROVADO' || o.status === 'REPROVADO') &&
            Array.isArray(o.falhas) &&
            typeof o.relatorio_markdown === 'string' &&
            typeof o.metricas === 'object' && o.metricas !== null);
    }
    async finishTest(sessionId, result) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        this.transition(sessionId, 'CONCLUIDO');
        let notionUrl = null;
        try {
            const title = `QA Run: ${sessionId} - ${new Date().toISOString().slice(0, 10)}`;
            notionUrl = await this.deps.notion.createReportPage(title, result.relatorio_markdown, {
                sessionId,
                targetWhatsApp: session.targetWhatsApp,
                status: result.status,
            });
        }
        catch (e) {
            await this.notifyAdmins(`Erro ao criar página Notion: ${String(e)}`);
        }
        const auditLog = {
            sessionId,
            targetWhatsApp: session.targetWhatsApp,
            tipoBot: session.botContext.tipoBot,
            status: result.status,
            result,
            conversationLog: session.conversationLog,
            finishedAt: new Date().toISOString(),
            notion_url: notionUrl,
        };
        try {
            await this.deps.supabase.saveAuditLog(auditLog);
        }
        catch (e) {
            await this.notifyAdmins(`Erro ao salvar no Supabase: ${String(e)}`);
        }
        const summary = `Teste ${sessionId} concluído: ${result.status}\nFalhas: ${result.falhas.length}\nBot: ${session.botContext.tipoBot}`;
        await this.notifyAdmins(summary);
    }
    scheduleTimeout(sessionId) {
        this.clearTimeout(sessionId);
        const handle = setTimeout(() => {
            const session = this.sessions.get(sessionId);
            if (session && (session.state === 'TESTANDO' || session.state === 'INICIANDO')) {
                this.transition(sessionId, 'FALHA_CRITICA');
                this.notifyAdmins(`⏱️ Palanca AI: Teste ${sessionId} expirou (timeout ${config.test.sessionTimeoutMs}ms).`);
            }
        }, config.test.sessionTimeoutMs);
        this.timeoutHandles.set(sessionId, handle);
    }
    resetTimeout(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session && (session.state === 'TESTANDO' || session.state === 'INICIANDO')) {
            this.scheduleTimeout(sessionId);
        }
    }
    clearTimeout(sessionId) {
        const handle = this.timeoutHandles.get(sessionId);
        if (handle) {
            clearTimeout(handle);
            this.timeoutHandles.delete(sessionId);
        }
    }
    normalizePhone(phone) {
        return phone.replace(/\D/g, '').replace(/^0/, '');
    }
    async notifyAdmins(message) {
        for (const chatId of this.telegramAdminChatIds) {
            try {
                await this.deps.telegram.sendAlert(chatId.trim(), message);
            }
            catch {
                // ignorar falha por chat
            }
        }
    }
}
//# sourceMappingURL=test.orchestrator.js.map