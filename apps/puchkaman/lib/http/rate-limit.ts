// ponytail: in-memory per-process counter — fine for this app's single
// instance, resets on deploy, and does NOT hold across instances if this ever
// scales out (see better-auth's own note in lib/auth/index.ts about the same
// tradeoff). Upgrade to a shared store (e.g. a rate_limit table like
// better-auth's `storage: "database"` option) if that changes.
const hits = new Map<string, { count: number; resetAt: number }>();

/** Returns true if `key` has exceeded `max` calls within `windowMs`. */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}
