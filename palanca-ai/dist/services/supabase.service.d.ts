/**
 * SupabaseService — Persistência de logs de teste na tabela test_runs.
 * Utiliza SUPABASE_SERVICE_ROLE_KEY para contornar RLS de forma segura na API.
 */
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
export declare class SupabaseService implements ISupabaseService {
    private readonly client;
    constructor();
    saveTestLog(data: TestLogData): Promise<void>;
    saveAuditLog(log: unknown): Promise<void>;
}
//# sourceMappingURL=supabase.service.d.ts.map