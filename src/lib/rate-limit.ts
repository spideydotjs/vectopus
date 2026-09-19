interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Clean up expired records every 60s
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
      if (now > record.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }, 60000);
  if (timer.unref) {
    timer.unref();
  }
}

/**
 * Check if an IP/client has exceeded the rate limit.
 * @param key Unique client identifier (e.g. IP)
 * @param limit Max requests allowed in the window
 * @param windowMs Time window in milliseconds (default: 60s)
 */
export function checkRateLimit(
  key: string,
  limit: number = 15,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}

/**
 * Concurrency limiter to prevent overloading local Ollama engine.
 */
class ConcurrencyLimiter {
  private active = 0;
  private readonly maxConcurrent: number;

  constructor(maxConcurrent: number = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  get isBusy(): boolean {
    return this.active >= this.maxConcurrent;
  }

  acquire(): boolean {
    if (this.active >= this.maxConcurrent) return false;
    this.active += 1;
    return true;
  }

  release(): void {
    if (this.active > 0) this.active -= 1;
  }
}

export const llmConcurrencyLimiter = new ConcurrencyLimiter(2);
