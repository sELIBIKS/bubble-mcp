import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../../src/middleware/rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows N requests within the limit', () => {
    const limiter = new RateLimiter(3);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('rejects request N+1 when limit is exhausted', () => {
    const limiter = new RateLimiter(3);
    limiter.tryAcquire();
    limiter.tryAcquire();
    limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('replenishes tokens after 60 seconds', () => {
    const limiter = new RateLimiter(3);
    limiter.tryAcquire();
    limiter.tryAcquire();
    limiter.tryAcquire();
    // Exhausted — N+1 should fail
    expect(limiter.tryAcquire()).toBe(false);

    vi.advanceTimersByTime(60_000);

    // After refill, should allow requests again
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    // Exhausted again
    expect(limiter.tryAcquire()).toBe(false);
  });
});
