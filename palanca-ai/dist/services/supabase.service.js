/**
 * SupabaseService — Persistência de logs de teste na tabela test_runs.
 * Utiliza SUPABASE_SERVICE_ROLE_KEY para contornar RLS de forma segura na API.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';
function getServiceKey() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? config.supabase.serviceKey;
    if (!key) {
        throw new Error('Supabase: SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SERVICE_KEY é obrigatória.');
    }
    return key;
}
export class SupabaseService {
    client;
    constructor() {
        const url = config.supabase.url;
        if (!url) {
            throw new Error('Supabase: SUPABASE_URL é obrigatória.');
        }
        this.client = createClient(url, getServiceKey(), {
            auth: { persistSession: false },
        });
    }
    async saveTestLog(data) {
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
        const { error } = await this.client.from('test_runs').insert(row);
        if (error) {
            throw new Error(`Supabase saveTestLog: ${error.message}`);
        }
    }
    async saveAuditLog(log) {
        const audit = log;
        const duration_turns = audit.conversationLog?.filter((t) => t.role === 'assistant').length ?? 0;
        const data = {
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
//# sourceMappingURL=supabase.service.js.map