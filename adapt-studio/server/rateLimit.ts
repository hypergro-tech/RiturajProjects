/** Sliding-window limiter keyed by client id (IP). In-memory: one process, one window. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly limit: number, private readonly windowMs: number) {}

  /** Returns 0 when allowed, otherwise the number of ms until the next slot frees up. */
  check(key: string, now = Date.now()): number {
    const cutoff = now - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return arr[0] + this.windowMs - now;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return 0;
  }
}
