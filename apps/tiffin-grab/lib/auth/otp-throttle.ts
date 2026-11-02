// Better-auth's OTP limit (3/min) is per IP, so a bot spread over many IPs can
// still flood ONE customer's inbox. Two caps per recipient address:
// - per (address, IP): a single bot IP can't burn the customer's own allowance,
//   so the real customer, on their own IP, still gets codes;
// - per address overall: bounds the flood; tripping it takes 5+ IPs.
// Node: in-memory, like better-auth's own store (one instance, resets on deploy).
// Workers: isolates share nothing, so the counts live in otp_throttle.
// ponytail: a refused attempt still bumps the DB counters (one statement for both
// keys); stricter than the in-memory path, which only records sends.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { isWorkers } from "@/lib/runtime/platform";

const WINDOW_MS = 60 * 60 * 1000;
const PER_IP = 6;
const PER_ADDRESS = 30;

const sent = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  return (sent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
}

const NOW_MS = sql`(extract(epoch from clock_timestamp()) * 1000)::bigint`;

async function allowOtpToDb(addr: string, pairKey: string): Promise<boolean> {
  const rows = await db.execute(sql`
    INSERT INTO otp_throttle AS t (key, count, window_start)
    VALUES (${addr}, 1, ${NOW_MS}), (${pairKey}, 1, ${NOW_MS})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN t.window_start < ${NOW_MS} - ${WINDOW_MS} THEN 1 ELSE t.count + 1 END,
      window_start = CASE WHEN t.window_start < ${NOW_MS} - ${WINDOW_MS} THEN ${NOW_MS} ELSE t.window_start END
    RETURNING key, count`);
  return rows.every((r) => Number(r.count) <= (r.key === addr ? PER_ADDRESS : PER_IP));
}

/** Records the send and returns true when `email` (from `ip`) is under both hourly caps. */
export async function allowOtpTo(email: string, ip: string | null, now = Date.now()): Promise<boolean> {
  const addr = email.trim().toLowerCase();
  const pairKey = `${addr}|${ip ?? "?"}`;
  if (isWorkers()) return allowOtpToDb(addr, pairKey);
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
