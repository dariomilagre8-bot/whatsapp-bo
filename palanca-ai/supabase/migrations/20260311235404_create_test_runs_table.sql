-- Palanca AI: tabela de execuções de teste (test runs)
-- Migração: create_test_runs_table

CREATE TABLE public.test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  bot_number text NOT NULL,
  bot_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('APROVADO', 'REPROVADO')),
  duration_turns integer NOT NULL,
  summary text,
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  notion_url text
);

COMMENT ON TABLE public.test_runs IS 'Registos de baterias de teste QA executadas pela Palanca AI';
COMMENT ON COLUMN public.test_runs.bot_number IS 'Número de WhatsApp do bot testado';
COMMENT ON COLUMN public.test_runs.bot_type IS 'Tipo/contexto do bot (ex: streaming)';
COMMENT ON COLUMN public.test_runs.status IS 'Resultado do teste: APROVADO ou REPROVADO';
COMMENT ON COLUMN public.test_runs.duration_turns IS 'Número de mensagens trocadas no loop de QA';
COMMENT ON COLUMN public.test_runs.summary IS 'Resumo do teste gerado pelo Claude';
COMMENT ON COLUMN public.test_runs.failures IS 'Array de falhas (JSONB) para consultas estruturadas';
COMMENT ON COLUMN public.test_runs.notion_url IS 'Link para o relatório detalhado no Notion';

-- Índices para consultas comuns
CREATE INDEX idx_test_runs_created_at ON public.test_runs (created_at DESC);
CREATE INDEX idx_test_runs_status ON public.test_runs (status);
CREATE INDEX idx_test_runs_bot_type ON public.test_runs (bot_type);

-- Row Level Security (RLS) — best practice
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;

-- Política: a API Node.js usa a service_role key para inserir e ler registos
CREATE POLICY "Allow service_role full access on test_runs"
  ON public.test_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
