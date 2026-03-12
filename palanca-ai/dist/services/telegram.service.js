/**
 * TelegramService — Comandos admin e alertas via node-telegram-bot-api.
 * Comando /testar_bot [numero] [tipo_de_bot] inicia o Orquestrador.
 */
import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/index.js';
export class TelegramService {
    bot;
    adminChatIds;
    constructor(adminChatIds) {
        const token = config.telegram.botToken;
        if (!token) {
            throw new Error('Telegram: TELEGRAM_BOT_TOKEN é obrigatória.');
        }
        this.bot = new TelegramBot(token, { polling: true });
        this.adminChatIds =
            (adminChatIds?.length ?? 0) > 0
                ? adminChatIds
                : (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    }
    getAdminChatIds() {
        return this.adminChatIds;
    }
    onCommand(command, handler) {
        const trigger = command.startsWith('/') ? command : `/${command}`;
        this.bot.onText(new RegExp(`^\\${trigger}(?:\\s+(.+))?$`, 's'), async (msg, match) => {
            const args = match?.[1]?.trim().split(/\s+/) ?? [];
            try {
                await handler(msg, args);
            }
            catch (err) {
                const chatId = msg.chat?.id;
                if (chatId != null) {
                    await this.bot.sendMessage(chatId, `Erro: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        });
    }
    async sendAlert(chatId, message) {
        await this.bot.sendMessage(String(chatId), message, { parse_mode: 'HTML' });
    }
    /** Envia alerta para todos os admins configurados em TELEGRAM_ADMIN_CHAT_IDS. */
    async sendAdminAlert(message) {
        for (const id of this.adminChatIds) {
            try {
                await this.sendAlert(id, message);
            }
            catch (err) {
                console.error('[TelegramService] Falha ao enviar para admin', id, err);
            }
        }
    }
}
//# sourceMappingURL=telegram.service.js.map