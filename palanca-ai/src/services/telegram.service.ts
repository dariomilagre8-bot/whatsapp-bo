/**
 * TelegramService — Comandos admin e alertas via node-telegram-bot-api.
 * Comando /testar_bot [numero] [tipo_de_bot] inicia o Orquestrador.
 */

import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/index.js';

export interface ITelegramService {
  sendAlert(chatId: number | string, message: string): Promise<void>;
  onCommand(command: string, handler: (msg: TelegramBot.Message, args: string[]) => void | Promise<void>): void;
}

export class TelegramService implements ITelegramService {
  private readonly bot: TelegramBot;
  private readonly adminChatIds: string[];

  constructor(adminChatIds?: string[]) {
    const token = config.telegram.botToken;
    if (!token) {
      throw new Error('Telegram: TELEGRAM_BOT_TOKEN é obrigatória.');
    }
    this.bot = new TelegramBot(token, { polling: true });
    this.adminChatIds =
      (adminChatIds?.length ?? 0) > 0
        ? adminChatIds!
        : (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }

  getAdminChatIds(): string[] {
    return this.adminChatIds;
  }

  onCommand(command: string, handler: (msg: TelegramBot.Message, args: string[]) => void | Promise<void>): void {
    const trigger = command.startsWith('/') ? command : `/${command}`;
    this.bot.onText(new RegExp(`^\\${trigger}(?:\\s+(.+))?$`, 's'), async (msg, match) => {
      const args = match?.[1]?.trim().split(/\s+/) ?? [];
      try {
        await handler(msg, args);
      } catch (err) {
        const chatId = msg.chat?.id;
        if (chatId != null) {
          await this.bot.sendMessage(chatId, `Erro: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });
  }

  async sendAlert(chatId: number | string, message: string): Promise<void> {
    await this.bot.sendMessage(String(chatId), message, { parse_mode: 'HTML' });
  }

  /** Envia alerta para todos os admins configurados em TELEGRAM_ADMIN_CHAT_IDS. */
  async sendAdminAlert(message: string): Promise<void> {
    for (const id of this.adminChatIds) {
      try {
        await this.sendAlert(id, message);
      } catch (err) {
        console.error('[TelegramService] Falha ao enviar para admin', id, err);
      }
    }
  }
}
