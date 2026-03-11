/**
 * Tipos gerados pelo Supabase CLI.
 * Gerar com: npm run generate-types
 * (Requer Supabase local em execução: npx supabase start)
 *
 * Placeholder até à primeira geração. Após correr generate-types, este ficheiro
 * será substituído pelos tipos oficiais gerados a partir do schema.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      test_runs: {
        Row: {
          id: string;
          created_at: string;
          bot_number: string;
          bot_type: string;
          status: 'APROVADO' | 'REPROVADO';
          duration_turns: number;
          summary: string | null;
          failures: Json;
          notion_url: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          bot_number: string;
          bot_type: string;
          status: 'APROVADO' | 'REPROVADO';
          duration_turns: number;
          summary?: string | null;
          failures?: Json;
          notion_url?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          bot_number?: string;
          bot_type?: string;
          status?: 'APROVADO' | 'REPROVADO';
          duration_turns?: number;
          summary?: string | null;
          failures?: Json;
          notion_url?: string | null;
        };
      };
    };
  };
}
