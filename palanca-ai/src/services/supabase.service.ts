/**
 * SupabaseService — Persistência de logs de teste na tabela test_runs.
 * Utiliza SUPABASE_SERVICE_ROLE_KEY para contornar RLS de forma segura na API.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase.js';
import { config } from '../config/index.js';

export interface TestLogData {
  bot_number: string;
  bot_type: string;
  status: 'APROVADO' | 'REPROVADO';
  duration_turns: number;
  summary: string | null;
  failures: string[];
  notion_url: string | null;
}

export interface ISupabaseService {
  saveAuditLog(log: unknown): Promise<void>;
  saveTestLog(data: TestLogData): Promise<void>;
}

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? config.supabase.serviceKey;
  if (!key) {
    throw new Error('Supabase: SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_KEY é obrigatória.');
  }
  return key;
}

export class SupabaseService implements ISupabaseService {
  private readonly client: SupabaseClient<Database>;

  constructor() {
    const url = config.supabase.url;
    if (!url) {
      throw new Error('Supabase: SUPABASE_URL é obrigatória.');
    }
    this.client = createClient<Database>(url, getServiceKey(), {
      auth: { persistSession: false },
    });
  }

  async saveTestLog(data: TestLogData): Promise<void> {
    const row = {
      bot_number: data.bot_number,
      bot_type: data.bot_type,
      status: data.status,
      duration_turns: data.duration_turns,
      summary: data.summary ?? null,
      failures: data.failures,
      notion_url: data.notion_url ?? null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await this.client.from('test_runs').insert(row as any);

    if (error) {
      throw new Error(`Supabase saveTestLog: ${error.message}`);
    }
  }

  async saveAuditLog(log: unknown): Promise<void> {
    const audit = log as {
      targetWhatsApp: string;
      tipoBot: string;
      status: 'APROVADO' | 'REPROVADO';
      result: { status: string; metricas?: Record<string, unknown>; falhas: string[]; relatorio_markdown: string };
      conversationLog: { role: string; content: string }[];
      notion_url?: string | null;
    };
    const duration_turns = audit.conversationLog?.filter((t: { role: string }) => t.role === 'assistant').length ?? 0;
    const data: TestLogData = {
      bot_number: audit.targetWhatsApp,
      bot_type: audit.tipoBot,
      status: audit.status,
      duration_turns,
      summary: audit.result?.relatorio_markdown?.slice(0, 2000) ?? null,
      failures: Array.isArray(audit.result?.falhas) ? audit.result.falhas : [],
      notion_url: audit.notion_url ?? null,
    };
    await this.saveTestLog(data);
  }
}
