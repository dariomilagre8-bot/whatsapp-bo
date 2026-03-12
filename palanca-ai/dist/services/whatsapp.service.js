/**
 * WhatsAppService — Sessão principal Palanca AI com whatsapp-web.js e LocalAuth.
 * Gera QR no terminal; envia mensagens e encaminha recebidas para o Orquestrador.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
export class WhatsAppService {
    client;
    messageCallback = null;
    disconnectCallback = null;
    connected = false;
    sessionPath;
    constructor(sessionPath) {
        this.sessionPath = sessionPath ?? process.env.WA_SESSION_PATH ?? './.wwebjs_auth';
        this.client = new Client({
            authStrategy: new LocalAuth({ dataPath: this.sessionPath }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
        });
        this.client.on('qr', (qr) => {
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
        this.client.on('message', async (msg) => {
            const from = msg.from.replace(/\D/g, '');
            const text = msg.type === 'chat' ? msg.body : msg.body || '[mensagem não textual]';
            if (this.messageCallback) {
                try {
                    this.messageCallback(from, text);
                }
                catch (err) {
                    console.error('[WhatsAppService] Erro no callback de mensagem:', err);
                }
            }
        });
    }
    onMessage(callback) {
        this.messageCallback = callback;
    }
    setDisconnectCallback(callback) {
        this.disconnectCallback = callback;
    }
    async start() {
        await this.client.initialize();
    }
    isConnected() {
        return this.connected;
    }
    async sendMessage(to, body) {
        if (!this.connected) {
            throw new Error('WhatsApp não está conectado.');
        }
        const normalized = to.replace(/\D/g, '');
        const chatId = normalized.includes('@') ? normalized : `${normalized}@c.us`;
        await this.client.sendMessage(chatId, body);
    }
}
//# sourceMappingURL=whatsapp.service.js.map