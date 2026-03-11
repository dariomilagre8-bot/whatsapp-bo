/**
 * SupabaseService — Logs de auditoria e histórico de baterias de teste.
 * A implementação será feita na fase de serviços.
 */

export interface ISupabaseService {
  saveAuditLog(log: unknown): Promise<void>;
}
