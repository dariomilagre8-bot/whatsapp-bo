/**
 * TelegramService — Comandos admin e alertas (node-telegram-bot-api).
 * A implementação será feita na fase de serviços.
 */

export interface ITelegramService {
  sendAlert(chatId: number | string, message: string): Promise<void>;
  onCommand(command: string, handler: (msg: unknown, args: string[]) => void): void;
}
