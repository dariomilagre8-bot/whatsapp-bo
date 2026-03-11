/**
 * Erro lançado quando a sessão de teste excede o tempo máximo permitido.
 */

export class TestTimeoutError extends Error {
  readonly sessionId: string;

  constructor(message: string, sessionId: string) {
    super(message);
    this.name = 'TestTimeoutError';
    this.sessionId = sessionId;
    Object.setPrototypeOf(this, TestTimeoutError.prototype);
  }
}
