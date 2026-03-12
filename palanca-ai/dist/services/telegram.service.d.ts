/**
 * TelegramService — Comandos admin e alertas via node-telegram-bot-api.
 * Comando /testar_bot [numero] [tipo_de_bot] inicia o Orquestrador.
 */
import TelegramBot from 'node-telegram-bot-api';
export interface ITelegramService {
    sendAlert(chatId: number | string, message: string): Promise<void>;
    onCommand(command: string, handler: (msg: TelegramBot.Message, args: string[]) => void | Promise<void>): void;
}
export declare class TelegramService implements ITelegramService {
    private readonly bot;
    private readonly adminChatIds;
    constructor(adminChatIds?: string[]);
    getAdminChatIds(): string[];
    onCommand(command: string, handler: (msg: TelegramBot.Message, args: string[]) => void | Promise<void>): void;
    sendAlert(chatId: number | string, message: string): Promise<void>;
    /** Envia alerta para todos os admins configurados em TELEGRAM_ADMIN_CHAT_IDS. */
    sendAdminAlert(message: string): Promise<void>;
}
//# sourceMappingURL=telegram.service.d.ts.map