/**
 * ClaudeService — Cérebro do QA: Claude como testador implacável.
 * Gera próxima interação ou resultado final em JSON estrito.
 */
export interface MessageHistory {
    role: 'user' | 'assistant';
    content: string;
}
export interface ClaudeResponse {
    type: 'message' | 'final';
    content?: string;
    status?: 'APROVADO' | 'REPROVADO';
    duration_turns?: number;
    summary?: string;
    failures?: string[];
    relatorio_markdown?: string;
}
export interface IClaudeService {
    evaluateSession(context: unknown, conversationLog: unknown[]): Promise<unknown>;
    getNextMessage(context: unknown, conversationLog: unknown[]): Promise<string>;
}
export declare class ClaudeService implements IClaudeService {
    private readonly client;
    constructor();
    generateNextInteraction(history: MessageHistory[], botType: string, options?: {
        forceFinal?: boolean;
    }): Promise<ClaudeResponse>;
    getNextMessage(context: unknown, conversationLog: unknown[]): Promise<string>;
    evaluateSession(context: unknown, conversationLog: unknown[]): Promise<unknown>;
}
//# sourceMappingURL=claude.service.d.ts.map