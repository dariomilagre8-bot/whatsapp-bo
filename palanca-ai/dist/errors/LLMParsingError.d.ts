/**
 * Erro lançado quando o Claude retorna um JSON inválido ou fora do contrato esperado.
 */
export declare class LLMParsingError extends Error {
    readonly rawContent: string;
    constructor(message: string, rawContent: string);
}
//# sourceMappingURL=LLMParsingError.d.ts.map