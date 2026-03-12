/**
 * Erro lançado quando a sessão de teste excede o tempo máximo permitido.
 */
export declare class TestTimeoutError extends Error {
    readonly sessionId: string;
    constructor(message: string, sessionId: string);
}
//# sourceMappingURL=TestTimeoutError.d.ts.map