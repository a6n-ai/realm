// ponytail: in-memory per-process counter — fine for this app's single
// instance, resets on deploy, and does NOT hold across instances if this ever
// scales out (see better-auth's own note in lib/auth/index.ts about the same
// tradeoff). Upgrade to better-auth's `storage: "database"` option (a
// `rateLimit` table) if that changes. Expired entries are swept every
// SWEEP_INTERVAL calls rather than on a timer, so the map's steady-state size
// is bounded by distinct keys seen per sweep window, not by total keys seen
// over the process lifetime.
const hits = new Map<string, { count: number; resetAt: number }>();

const SWEEP_INTERVAL = 500;
let callsSinceSweep = 0;

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV4_MAPPED_IPV6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * Buckets an IPv6 address by its /64 prefix (the block an ISP hands a single
 * customer, RFC 6177) so rotating through the trailing 64 bits can't dodge
 * the counter. IPv4-mapped IPv6 (`::ffff:a.b.c.d`) folds to its IPv4 form so
 * it can't double-dip against the same address's own bucket. Plain IPv4 is
 * left keyed individually.
 */
function normalizeKey(key: string): string {
  const mapped = key.match(IPV4_MAPPED_IPV6);
  if (mapped) return mapped[1]!;
  if (IPV4.test(key) || !key.includes(":")) return key;

  const [head = "", tail = ""] = key.split("::");
  const headGroups = head ? head.split(":").filter(Boolean) : [];
  const tailGroups = tail ? tail.split(":").filter(Boolean) : [];
  const groups = key.includes("::")
    ? [...headGroups, ...Array(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill("0"), ...tailGroups]
    : key.split(":");

  return groups.slice(0, 4).join(":");
}

/**
 * Returns true if `key` has exceeded `max` calls within `windowMs`.
 *
 * `namespace` buckets a caller's counters separately while still letting an IP
 * key go through the /64 folding above — prefixing the namespace onto the raw
 * key yourself would make it unrecognisable as an address and hand an IPv6
 * client a fresh bucket per request.
 */
export function isRateLimited(
  rawKey: string,
  max: number,
  windowMs: number,
  namespace?: string,
): boolean {
  const normalized = normalizeKey(rawKey);
  const key = namespace ? `${namespace}|${normalized}` : normalized;
  const now = Date.now();

  if (++callsSinceSweep >= SWEEP_INTERVAL) {
    callsSinceSweep = 0;
    for (const [k, v] of hits) {
      if (now > v.resetAt) hits.delete(k);
    }
  }

  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}
