/** Entries beyond this count trigger a sweep of expired windows, so memory stays bounded. */
const SWEEP_AT = 1_000;

/** A fixed-window limit per key, in the memory of this one process. */
export function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()): boolean => {
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size >= SWEEP_AT) {
        for (const [k, e] of hits) if (e.resetAt <= now) hits.delete(k);
      }
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
