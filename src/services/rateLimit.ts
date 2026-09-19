/**
 * Mobin Panel — in-memory rate limiting
 * Created by Mobin.A
 *
 * Sliding-window limiter keyed by IP + route. Workers isolates state per
 * instance, so this is a per-instance limiter — still effective against
 * bursts and password-guessing, and zero-cost (no KV round trip).
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

/**
 * @param key      logical limiter id (e.g. `login`, `api`, `doh`)
 * @param ip       client address
 * @param limit    max hits
 * @param windowMs window size in ms
 * @returns false when the request exceeds the limit.
 */
export function allow(key: string, ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Opportunistic sweep to keep memory bounded.
  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    lastSweep = now;
    for (const [k, b] of buckets) {
      b.hits = b.hits.filter((t) => now - t < windowMs);
      if (b.hits.length === 0) buckets.delete(k);
    }
  }
  const k = `${key}:${ip}`;
  let b = buckets.get(k);
  if (!b) {
    b = { hits: [] };
    buckets.set(k, b);
  }
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) return false;
  b.hits.push(now);
  return true;
}

/** Best-effort client IP (Workers sets CF-Connecting-IP; fall back to XFF). */
export function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0]!.trim() ||
    'unknown'
  );
}

/** Test-only reset. */
export function __resetRateLimit(): void {
  buckets.clear();
  lastSweep = 0;
}
