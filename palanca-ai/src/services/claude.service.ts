/**
 * ClaudeService — Integração com Anthropic (Claude como Juiz de QA).
 * A implementação será feita na fase de serviços.
 */

export interface IClaudeService {
  evaluateSession(context: unknown, conversationLog: unknown[]): Promise<unknown>;
  getNextMessage(context: unknown, conversationLog: unknown[]): Promise<string>;
}
