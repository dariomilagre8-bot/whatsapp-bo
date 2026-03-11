/**
 * Erro lançado quando o Claude retorna um JSON inválido ou fora do contrato esperado.
 */

export class LLMParsingError extends Error {
  readonly rawContent: string;

  constructor(message: string, rawContent: string) {
    super(message);
    this.name = 'LLMParsingError';
    this.rawContent = rawContent;
    Object.setPrototypeOf(this, LLMParsingError.prototype);
  }
}
