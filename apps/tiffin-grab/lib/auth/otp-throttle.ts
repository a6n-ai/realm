// Better-auth's OTP limit (3/min) is per IP, so a bot spread over many IPs can
// still flood ONE customer's inbox. Two caps per recipient address:
// - per (address, IP): a single bot IP can't burn the customer's own allowance,
//   so the real customer, on their own IP, still gets codes;
// - per address overall: bounds the flood; tripping it takes 5+ IPs.
// ponytail: in-memory, like better-auth's own store — one instance, resets on
// deploy. Move to Redis/DB if the app ever runs more than one process.
const WINDOW_MS = 60 * 60 * 1000;
const PER_IP = 6;
const PER_ADDRESS = 30;

const sent = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  return (sent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
}

/** Records the send and returns true when `email` (from `ip`) is under both hourly caps. */
export function allowOtpTo(email: string, ip: string | null, now = Date.now()): boolean {
  const addr = email.trim().toLowerCase();
  const pairKey = `${addr}|${ip ?? "?"}`;
  const all = recent(addr, now);
  const pair = recent(pairKey, now);
  if (all.length >= PER_ADDRESS || pair.length >= PER_IP) {
    sent.set(addr, all);
    sent.set(pairKey, pair);
    return false;
  }
  sent.set(addr, [...all, now]);
  sent.set(pairKey, [...pair, now]);
  // Keep the map from growing without bound under a spray of addresses.
  if (sent.size > 20_000) {
    for (const [k, ts] of sent) if (!ts.some((t) => now - t < WINDOW_MS)) sent.delete(k);
  }
  return true;
}
