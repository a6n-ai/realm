// Better-auth's OTP limit (3/min) is per IP, so a bot spread over many IPs can
// still flood ONE customer's inbox. Two caps per recipient address:
// - per (address, IP): a single bot IP can't burn the customer's own allowance,
//   so the real customer, on their own IP, still gets codes;
// - per address overall: bounds the flood; tripping it takes 5+ IPs.
// Node: in-memory, like better-auth's own store (one instance, resets on deploy).
// Workers: isolates share nothing, so the counts live in otp_throttle.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { isWorkers } from "@foundry/commons/runtime/platform";

const WINDOW_MS = 60 * 60 * 1000;
const PER_IP = 6;
const PER_ADDRESS = 30;

const sent = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  return (sent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
}

const NOW_MS = sql`(extract(epoch from clock_timestamp()) * 1000)::bigint`;

// Rows are locked address-then-pair (key order: the address is a prefix of its pair
// key), so concurrent calls can't deadlock; counters advance only when both pass.
async function allowOtpToDb(addr: string, pairKey: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO otp_throttle (key, count, window_start)
      VALUES (${addr}, 0, ${NOW_MS}), (${pairKey}, 0, ${NOW_MS})
      ON CONFLICT (key) DO NOTHING`);
    const rows = await tx.execute(sql`
      SELECT key, CASE WHEN window_start < ${NOW_MS} - ${WINDOW_MS} THEN 0 ELSE count END AS count
      FROM otp_throttle WHERE key IN (${addr}, ${pairKey}) ORDER BY key FOR UPDATE`);
    if (!rows.every((r) => Number(r.count) + 1 <= (r.key === addr ? PER_ADDRESS : PER_IP))) return false;
    await tx.execute(sql`
      UPDATE otp_throttle SET
        count = CASE WHEN window_start < ${NOW_MS} - ${WINDOW_MS} THEN 1 ELSE count + 1 END,
        window_start = CASE WHEN window_start < ${NOW_MS} - ${WINDOW_MS} THEN ${NOW_MS} ELSE window_start END
      WHERE key IN (${addr}, ${pairKey})`);
    return true;
  });
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
