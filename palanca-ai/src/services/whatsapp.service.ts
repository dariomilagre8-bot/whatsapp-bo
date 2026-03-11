/**
 * WhatsAppService — Sessão principal Palanca AI para enviar/recibir mensagens no fluxo de teste.
 * A implementação será feita na fase de serviços.
 */

export interface IWhatsAppService {
  sendMessage(to: string, text: string): Promise<void>;
  onMessage(callback: (from: string, text: string) => void): void;
  isConnected(): boolean;
}
