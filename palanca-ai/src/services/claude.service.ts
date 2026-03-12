/**
 * ClaudeService — Cérebro do QA: Claude como testador implacável.
 * Gera próxima interação ou resultado final em JSON estrito.
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import type { ConversationTurn, TestResult } from '../types/index.js';
import { LLMParsingError } from '../errors/LLMParsingError.js';

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

const FINAL_JSON_REGEX = /\{[\s\S]*?"status"\s*:\s*"(?:APROVADO|REPROVADO)"[\s\S]*?\}/;

function buildSystemPrompt(botType: string): string {
  const base = `És o testador de QA implacável da Palanca AI. O teu papel é conversar com um bot no WhatsApp como se fosses um utilizador real e, no final, avaliar se o bot passou ou falhou no teste.

Regras:
- Escreve mensagens curtas e naturais (uma de cada vez), como um utilizador real.
- Quando decidires que já tens informação suficiente para avaliar, responde APENAS com um único objeto JSON válido, sem texto antes ou depois, com exatamente estes campos:
  - status: "APROVADO" ou "REPROVADO"
  - duration_turns: número de mensagens que enviaste (turnos)
  - summary: string com resumo em uma frase
  - failures: array de strings com cada falha encontrada (ou [] se aprovado)
  - relatorio_markdown: string em Markdown com o relatório detalhado do teste
- Não inventes respostas do bot; usa apenas o histórico que te é dado.
- Sê crítico: só aprova se o bot cumprir corretamente as funções esperadas para o seu tipo.`;

  if (botType.toLowerCase() === 'streaming') {
    return `${base}

CONTEXTO OBRIGATÓRIO PARA BOT DE STREAMING:
Deves obrigatoriamente validar:
1. Verificação de estoque (getStockCountsForPrompt): o bot deve conseguir consultar/mostrar informação de disponibilidade para contas Netflix e Prime Video. Testa pedindo planos ou disponibilidade para esses serviços.
2. Alocação de telas (allocateProfile): o bot deve conseguir alocar ou gerir perfis/telas sem erros nem travamentos. Testa pedindo para adicionar perfil, trocar perfil ou alocar tela.

Se o bot falhar em qualquer uma destas funções, falha em respostas incoerentes ou em erro, o resultado deve ser REPROVADO e as falhas devem ser listadas em "failures".`;
  }

  return base;
}

function conversationToMessages(log: ConversationTurn[]): MessageHistory[] {
  return log.map((t) => ({
    role: t.role as 'user' | 'assistant',
    content: t.content,
  }));
}

function parseFinalResponse(text: string): ClaudeResponse | null {
  const match = text.match(FINAL_JSON_REGEX);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (parsed.status !== 'APROVADO' && parsed.status !== 'REPROVADO') return null;
    return {
      type: 'final',
      status: parsed.status as 'APROVADO' | 'REPROVADO',
      duration_turns: typeof parsed.duration_turns === 'number' ? parsed.duration_turns : 0,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      failures: Array.isArray(parsed.failures) ? (parsed.failures as string[]) : [],
      relatorio_markdown: typeof parsed.relatorio_markdown === 'string' ? parsed.relatorio_markdown : '',
    };
  } catch {
    return null;
  }
}

export class ClaudeService implements IClaudeService {
  private readonly client: Anthropic;

  constructor() {
    const apiKey = config.anthropic.apiKey;
    if (!apiKey) {
      throw new Error('Claude: ANTHROPIC_API_KEY é obrigatória.');
    }
    this.client = new Anthropic({ apiKey });
  }

  async generateNextInteraction(
    history: MessageHistory[],
    botType: string,
    options?: { forceFinal?: boolean }
  ): Promise<ClaudeResponse> {
    const systemPrompt = buildSystemPrompt(botType);
    const forceFinal = options?.forceFinal ?? false;

    const messages: Anthropic.MessageParam[] = history.length === 0
      ? [{ role: 'user', content: 'Inicia o teste: envia a primeira mensagem como utilizador para o bot.' }]
      : history.map((h) => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
        }));

    if (forceFinal) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const extra = lastUser
        ? []
        : ([
            {
              role: 'user' as const,
              content:
                'Avalia a conversa e responde APENAS com o objeto JSON final (status, duration_turns, summary, failures, relatorio_markdown).',
            },
          ] as Anthropic.MessageParam[]);
      messages.push(...extra);
    }

    const response = await this.client.messages.create({
      model: config.anthropic.model,
      max_tokens: config.anthropic.maxTokens,
      system: systemPrompt,
      messages,
    });

    const block = response.content.find((b) => b.type === 'text');
    const text = block && 'text' in block ? (block as { text: string }).text : '';

    const final = parseFinalResponse(text);
    if (final) return final;

    if (forceFinal) {
      throw new LLMParsingError('Claude não devolveu JSON final válido.', text);
    }

    return { type: 'message', content: text.trim() || '...' };
  }

  async getNextMessage(context: unknown, conversationLog: unknown[]): Promise<string> {
    const ctx = context as { botContext?: { tipoBot?: string }; targetWhatsApp?: string };
    const log = conversationLog as ConversationTurn[];
    const botType = ctx?.botContext?.tipoBot ?? 'generic';
    const history = conversationToMessages(log);

    const result = await this.generateNextInteraction(history, botType);

    if (result.type === 'final' && result.status != null) {
      return JSON.stringify({
        status: result.status,
        duration_turns: result.duration_turns ?? 0,
        summary: result.summary ?? '',
        falhas: result.failures ?? [],
        relatorio_markdown: result.relatorio_markdown ?? '',
        metricas: { duration_turns: result.duration_turns ?? 0 },
      });
    }

    return result.content ?? '';
  }

  async evaluateSession(context: unknown, conversationLog: unknown[]): Promise<unknown> {
    const ctx = context as { botContext?: { tipoBot?: string } };
    const log = conversationLog as ConversationTurn[];
    const botType = ctx?.botContext?.tipoBot ?? 'generic';
    const history = conversationToMessages(log);

    const result = await this.generateNextInteraction(history, botType, { forceFinal: true });

    if (result.type !== 'final') {
      throw new LLMParsingError('Esperado resultado final em JSON.', result.content ?? '');
    }

    const testResult: TestResult = {
      status: result.status!,
      metricas: { duration_turns: result.duration_turns ?? 0 },
      falhas: result.failures ?? [],
      relatorio_markdown: result.relatorio_markdown ?? '',
    };
    return testResult;
  }
}
