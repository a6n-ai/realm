import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { KvLike } from "@/lib/cache/kv-tier";
import { isWorkers } from "./platform";

// Raw keys in the CACHE namespace, read by cloudflare/worker.js (plain JS, no app imports) to decide
// whether the per-minute cron needs to wake the app. Keep the strings in sync with cloudflare/due-tasks.js.
export const NOTIFY_NEXT_KEY = "cron:notify:next";
export const SITE_NEXT_KEY = "cron:site:next";

const IDLE_MS = 365 * 24 * 3600_000;

// Best-effort and Workers-only: a failed write only means the safety minutes pick the work up later.
async function withKv(op: (kv: KvLike) => Promise<unknown>): Promise<void> {
  if (!isWorkers()) return;
  try {
    await op((getCloudflareContext().env as unknown as { CACHE: KvLike }).CACHE);
  } catch (err) {
    console.error("cron marker write failed", err);
  }
}

/** null = nothing queued: parked far out, so only the hourly safety run looks in. */
export const setNotifyNext = (at: number | null): Promise<void> =>
  withKv((kv) => kv.put(NOTIFY_NEXT_KEY, String(at ?? Date.now() + IDLE_MS)));

/** A campaign was scheduled for `at`: pull the marker forward if that is sooner than what is stored. */
export const lowerNotifyNext = (at: number): Promise<void> =>
  withKv(async (kv) => {
    const cur = Number(await kv.get(NOTIFY_NEXT_KEY));
    if (!Number.isFinite(cur) || cur <= 0 || at < cur) await kv.put(NOTIFY_NEXT_KEY, String(at));
  });

export const setSiteNext = (at: number): Promise<void> => withKv((kv) => kv.put(SITE_NEXT_KEY, String(at)));
