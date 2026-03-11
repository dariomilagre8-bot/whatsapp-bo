/**
 * NotionService — Criação de páginas de relatório com o Markdown gerado pelo Claude.
 * A implementação será feita na fase de serviços.
 */

export interface INotionService {
  createReportPage(title: string, markdown: string, metadata?: Record<string, unknown>): Promise<string>;
}
