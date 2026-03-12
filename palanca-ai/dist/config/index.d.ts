/**
 * Configurações centralizadas — Palanca AI
 * Carrega variáveis de ambiente e expõe config tipada.
 */
export declare const config: {
    readonly nodeEnv: string;
    readonly telegram: {
        readonly botToken: string;
    };
    readonly anthropic: {
        readonly apiKey: string;
        readonly model: string;
        readonly maxTokens: number;
    };
    readonly supabase: {
        readonly url: string;
        readonly serviceKey: string;
    };
    readonly notion: {
        readonly apiKey: string;
        readonly parentPageId: string;
    };
    readonly test: {
        readonly sessionTimeoutMs: number;
        readonly maxTurns: number;
    };
};
//# sourceMappingURL=index.d.ts.map