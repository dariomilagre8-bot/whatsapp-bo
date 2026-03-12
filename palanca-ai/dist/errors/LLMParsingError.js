/**
 * Erro lançado quando o Claude retorna um JSON inválido ou fora do contrato esperado.
 */
export class LLMParsingError extends Error {
    rawContent;
    constructor(message, rawContent) {
        super(message);
        this.name = 'LLMParsingError';
        this.rawContent = rawContent;
        Object.setPrototypeOf(this, LLMParsingError.prototype);
    }
}
//# sourceMappingURL=LLMParsingError.js.map