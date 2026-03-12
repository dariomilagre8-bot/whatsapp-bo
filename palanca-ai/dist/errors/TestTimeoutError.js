/**
 * Erro lançado quando a sessão de teste excede o tempo máximo permitido.
 */
export class TestTimeoutError extends Error {
    sessionId;
    constructor(message, sessionId) {
        super(message);
        this.name = 'TestTimeoutError';
        this.sessionId = sessionId;
        Object.setPrototypeOf(this, TestTimeoutError.prototype);
    }
}
//# sourceMappingURL=TestTimeoutError.js.map