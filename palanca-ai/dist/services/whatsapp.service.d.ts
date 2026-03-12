/**
 * WhatsAppService — Sessão principal Palanca AI com whatsapp-web.js e LocalAuth.
 * Gera QR no terminal; envia mensagens e encaminha recebidas para o Orquestrador.
 */
export interface IWhatsAppService {
    sendMessage(to: string, body: string): Promise<void>;
    onMessage(callback: (from: string, text: string) => void): void;
    isConnected(): boolean;
}
export declare class WhatsAppService implements IWhatsAppService {
    private client;
    private messageCallback;
    private disconnectCallback;
    private connected;
    private sessionPath;
    constructor(sessionPath?: string);
    onMessage(callback: (from: string, text: string) => void): void;
    setDisconnectCallback(callback: () => void): void;
    start(): Promise<void>;
    isConnected(): boolean;
    sendMessage(to: string, body: string): Promise<void>;
}
//# sourceMappingURL=whatsapp.service.d.ts.map