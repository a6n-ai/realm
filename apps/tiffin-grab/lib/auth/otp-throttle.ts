// Better-auth's OTP limit (3/min) is per IP, so a bot spread over many IPs can
// still flood ONE customer's inbox. This caps codes per recipient address.
// ponytail: in-memory, like better-auth's own store — one instance, resets on
// deploy. Move to Redis/DB if the app ever runs more than one process.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 6;

const sent = new Map<string, number[]>();

/** Records the send and returns true when `email` is still under its hourly cap. */
export function allowOtpTo(email: string, now = Date.now()): boolean {
  const key = email.trim().toLowerCase();
  const recent = (sent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    sent.set(key, recent);
    return false;
  }
  recent.push(now);
  sent.set(key, recent);
  // Keep the map from growing without bound under a spray of addresses.
  if (sent.size > 10_000) {
    for (const [k, ts] of sent) if (!ts.some((t) => now - t < WINDOW_MS)) sent.delete(k);
  }
  return true;
}
