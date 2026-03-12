/**
 * WhatsAppService — Sessão principal Palanca AI com whatsapp-web.js e LocalAuth.
 * Gera QR no terminal; envia mensagens e encaminha recebidas para o Orquestrador.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

export interface IWhatsAppService {
  sendMessage(to: string, body: string): Promise<void>;
  onMessage(callback: (from: string, text: string) => void): void;
  isConnected(): boolean;
}

export class WhatsAppService implements IWhatsAppService {
  private client: InstanceType<typeof Client>;
  private messageCallback: ((from: string, text: string) => void) | null = null;
  private disconnectCallback: (() => void) | null = null;
  private connected = false;
  private sessionPath: string;

  constructor(sessionPath?: string) {
    this.sessionPath = sessionPath ?? process.env.WA_SESSION_PATH ?? './.wwebjs_auth';
    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: this.sessionPath }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.client.on('qr', (qr: string) => {
      console.log('\n[Palanca AI] Escaneia o QR Code com o WhatsApp para ligar a sessão:\n');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      this.connected = true;
      console.log('[Palanca AI] WhatsApp conectado.');
    });

    this.client.on('disconnected', () => {
      this.connected = false;
      this.disconnectCallback?.();
    });

    this.client.on('message', async (msg: { from: string; body: string; type: string }) => {
      const from = msg.from.replace(/\D/g, '');
      const text = msg.type === 'chat' ? msg.body : msg.body || '[mensagem não textual]';
      if (this.messageCallback) {
        try {
          this.messageCallback(from, text);
        } catch (err) {
          console.error('[WhatsAppService] Erro no callback de mensagem:', err);
        }
      }
    });
  }

  onMessage(callback: (from: string, text: string) => void): void {
    this.messageCallback = callback;
  }

  setDisconnectCallback(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  async start(): Promise<void> {
    await this.client.initialize();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async sendMessage(to: string, body: string): Promise<void> {
    if (!this.connected) {
      throw new Error('WhatsApp não está conectado.');
    }
    const normalized = to.replace(/\D/g, '');
    const chatId = normalized.includes('@') ? normalized : `${normalized}@c.us`;
    await this.client.sendMessage(chatId, body);
  }
}
