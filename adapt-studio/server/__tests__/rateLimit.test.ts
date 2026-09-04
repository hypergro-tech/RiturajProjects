import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../rateLimit.js';

describe('RateLimiter', () => {
  it('allows `limit` hits per window, then reports the wait until the oldest hit expires', () => {
    const rl = new RateLimiter(3, 60_000);
    expect(rl.check('a', 0)).toBe(0);
    expect(rl.check('a', 1_000)).toBe(0);
    expect(rl.check('a', 2_000)).toBe(0);
    expect(rl.check('a', 3_000)).toBe(57_000);
    expect(rl.check('b', 3_000)).toBe(0); // independent keys
    expect(rl.check('a', 60_001)).toBe(0); // first hit aged out
  });
});
