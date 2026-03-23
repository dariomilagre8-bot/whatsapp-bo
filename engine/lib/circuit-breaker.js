// engine/lib/circuit-breaker.js

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.maxFailures = options.maxFailures || 3;
    this.resetTimeout = options.resetTimeout || 60000;
    this.failures = 0;
    this.lastFailure = 0;
    this.state = 'closed';
  }

  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.maxFailures) {
      this.state = 'open';
      console.error(`[CIRCUIT-BREAKER] ${this.name} ABERTO — ${this.failures} falhas consecutivas`);
    }
  }

  recordSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  canExecute() {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
        console.log(`[CIRCUIT-BREAKER] ${this.name} half-open — testando...`);
        return true;
      }
      return false;
    }
    return true;
  }

  getState() {
    if (this.state === 'open' && Date.now() - this.lastFailure > this.resetTimeout) {
      this.state = 'half-open';
    }
    return { name: this.name, state: this.state, failures: this.failures };
  }
}

module.exports = { CircuitBreaker };
