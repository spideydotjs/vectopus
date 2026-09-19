import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, llmConcurrencyLimiter } from "./rate-limit.ts";

test("checkRateLimit allows requests within limit and blocks excess", () => {
  const testKey = `test_ip_${Date.now()}`;
  
  // First 3 should be allowed
  const r1 = checkRateLimit(testKey, 3, 5000);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  const r2 = checkRateLimit(testKey, 3, 5000);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);

  const r3 = checkRateLimit(testKey, 3, 5000);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);

  // 4th request must be blocked
  const r4 = checkRateLimit(testKey, 3, 5000);
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
});

test("llmConcurrencyLimiter respects max concurrency", () => {
  // Acquire up to limit
  assert.equal(llmConcurrencyLimiter.acquire(), true);
  assert.equal(llmConcurrencyLimiter.acquire(), true);
  
  // 3rd attempt should fail
  assert.equal(llmConcurrencyLimiter.acquire(), false);
  assert.equal(llmConcurrencyLimiter.isBusy, true);

  // Release one
  llmConcurrencyLimiter.release();
  assert.equal(llmConcurrencyLimiter.isBusy, false);

  // Acquire again
  assert.equal(llmConcurrencyLimiter.acquire(), true);

  // Clean up
  llmConcurrencyLimiter.release();
  llmConcurrencyLimiter.release();
});
