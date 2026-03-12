/**
 * NotionService — Criação de páginas de relatório QA no Notion.
 * Converte o Markdown do Claude em blocos Notion e retorna a URL da página.
 */
export interface QAReportData {
    runNumber?: string;
    date?: string;
    markdown: string;
    title?: string;
    [key: string]: unknown;
}
export interface INotionService {
    createReportPage(title: string, markdown: string, metadata?: Record<string, unknown>): Promise<string>;
    createQAReport(reportData: QAReportData): Promise<string>;
}
export declare class NotionService implements INotionService {
    private readonly client;
    private readonly parentPageId;
    constructor();
    createQAReport(reportData: QAReportData): Promise<string>;
    createReportPage(title: string, markdown: string, metadata?: Record<string, unknown>): Promise<string>;
}
//# sourceMappingURL=notion.service.d.ts.map