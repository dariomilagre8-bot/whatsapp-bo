// engine/lib/rate-limiter.js

class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 5;
    this.windowMs = options.windowMs || 30000;
    this.requests = new Map();
  }

  isAllowed(phone) {
    const key = phone != null ? String(phone) : '';
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(key)) {
      this.requests.set(key, [now]);
      return true;
    }

    const timestamps = this.requests.get(key).filter((t) => t > windowStart);
    timestamps.push(now);
    this.requests.set(key, timestamps);

    return timestamps.length <= this.maxRequests;
  }

  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [phone, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter((t) => t > windowStart);
      if (valid.length === 0) this.requests.delete(phone);
      else this.requests.set(phone, valid);
    }
  }
}

module.exports = { RateLimiter };
