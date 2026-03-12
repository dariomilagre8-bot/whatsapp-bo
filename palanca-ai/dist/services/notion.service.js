/**
 * NotionService — Criação de páginas de relatório QA no Notion.
 * Converte o Markdown do Claude em blocos Notion e retorna a URL da página.
 */
import { Client } from '@notionhq/client';
import { config } from '../config/index.js';
/** Converte Markdown em blocos Notion (parágrafos, headings, listas simples). */
function markdownToNotionBlocks(markdown) {
    const blocks = [];
    const lines = markdown.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
            i++;
            continue;
        }
        if (/^#{3}\s/.test(trimmed)) {
            blocks.push({
                object: 'block',
                type: 'heading_3',
                heading_3: {
                    rich_text: [{ type: 'text', text: { content: trimmed.replace(/^#{3}\s*/, '') } }],
                },
            });
            i++;
            continue;
        }
        if (/^##\s/.test(trimmed)) {
            blocks.push({
                object: 'block',
                type: 'heading_2',
                heading_2: {
                    rich_text: [{ type: 'text', text: { content: trimmed.replace(/^##\s*/, '') } }],
                },
            });
            i++;
            continue;
        }
        if (/^#\s/.test(trimmed)) {
            blocks.push({
                object: 'block',
                type: 'heading_1',
                heading_1: {
                    rich_text: [{ type: 'text', text: { content: trimmed.replace(/^#\s*/, '') } }],
                },
            });
            i++;
            continue;
        }
        if (/^-\s/.test(trimmed) || /^\*\s/.test(trimmed)) {
            const content = trimmed.replace(/^[-*]\s*/, '');
            blocks.push({
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                    rich_text: [{ type: 'text', text: { content } }],
                },
            });
            i++;
            continue;
        }
        if (/^\d+\.\s/.test(trimmed)) {
            const content = trimmed.replace(/^\d+\.\s*/, '');
            blocks.push({
                object: 'block',
                type: 'numbered_list_item',
                numbered_list_item: {
                    rich_text: [{ type: 'text', text: { content } }],
                },
            });
            i++;
            continue;
        }
        if (/^>/.test(trimmed)) {
            blocks.push({
                object: 'block',
                type: 'quote',
                quote: {
                    rich_text: [{ type: 'text', text: { content: trimmed.replace(/^>\s*/, '') } }],
                },
            });
            i++;
            continue;
        }
        blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
                rich_text: [{ type: 'text', text: { content: trimmed } }],
            },
        });
        i++;
    }
    if (blocks.length === 0) {
        blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: '(Sem conteúdo)' } }] },
        });
    }
    return blocks;
}
export class NotionService {
    client;
    parentPageId;
    constructor() {
        const apiKey = config.notion.apiKey;
        if (!apiKey) {
            throw new Error('Notion: NOTION_API_KEY é obrigatória.');
        }
        this.client = new Client({ auth: apiKey });
        const parent = config.notion.parentPageId;
        if (!parent) {
            throw new Error('Notion: NOTION_PARENT_PAGE_ID é obrigatória.');
        }
        this.parentPageId = parent;
    }
    async createQAReport(reportData) {
        const runNumber = reportData.runNumber ?? 'N/A';
        const date = reportData.date ?? new Date().toISOString().slice(0, 10);
        const title = typeof reportData.title === 'string' && reportData.title.length > 0
            ? reportData.title
            : `QA Run: ${runNumber} - ${date}`;
        const markdown = reportData.markdown ?? '';
        const children = markdownToNotionBlocks(markdown);
        const response = await this.client.pages.create({
            parent: { type: 'page_id', page_id: this.parentPageId },
            properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
            icon: { type: 'emoji', emoji: '📋' },
            children,
        });
        const page = response;
        if (page.url && typeof page.url === 'string')
            return page.url;
        const id = page.id;
        return id ? `https://www.notion.so/${id.replace(/-/g, '')}` : '';
    }
    async createReportPage(title, markdown, metadata) {
        return this.createQAReport({
            title,
            markdown,
            ...metadata,
        });
    }
}
//# sourceMappingURL=notion.service.js.map