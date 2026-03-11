/**
 * Contratos e tipos globais — Palanca AI
 */

/** Estado da máquina de estados do orquestrador */
export type TestState =
  | 'INICIANDO'
  | 'TESTANDO'
  | 'AVALIANDO'
  | 'CONCLUIDO'
  | 'FALHA_CRITICA';

/** Contexto do bot alvo passado ao Claude (tipo de bot, regras de negócio a validar) */
export interface BotContext {
  tipoBot: string;
  descricao?: string;
  regrasNegocio?: string[];
}

/** Sessão de teste em curso */
export interface TestSession {
  id: string;
  targetWhatsApp: string;
  botContext: BotContext;
  state: TestState;
  startedAt: Date;
  conversationLog: ConversationTurn[];
  metadata?: Record<string, unknown>;
}

/** Um turno da conversa (Palanca → Bot Alvo → resposta) */
export interface ConversationTurn {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
}

/** Resultado final devolvido pelo Claude (JSON estrito) */
export interface TestResult {
  status: 'APROVADO' | 'REPROVADO';
  metricas: Record<string, number | string>;
  falhas: string[];
  relatorio_markdown: string;
}

/** Payload enviado ao Supabase após conclusão */
export interface TestAuditLog {
  sessionId: string;
  targetWhatsApp: string;
  tipoBot: string;
  status: 'APROVADO' | 'REPROVADO';
  result: TestResult;
  conversationLog: ConversationTurn[];
  finishedAt: string; // ISO
}
