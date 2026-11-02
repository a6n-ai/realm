import Redis from "ioredis";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createLogger } from "@foundry/commons/logger";
import { isWorkers } from "@/lib/runtime/platform";

const log = createLogger("outbox-signal");

// The outbox row is the record; this list only says "look now". LTRIM keeps it
// at one entry, so a burst of enqueues wakes the listener once and a single
// drainPending() picks up every row.
export const OUTBOX_SIGNAL_KEY = "notify:outbox";

let pusher: Redis | undefined;

/**
 * Wake the outbox consumer. Call it after the enqueuing transaction commits, or the
 * consumer can drain before the rows exist. A lost signal only delays the mail until
 * the next signal or the per-minute tick, so this never fails the caller.
 * Workers: a Queue message (the binding is read per call, never cached). Node: Redis.
 */
export async function signalOutbox(): Promise<void> {
  if (isWorkers()) {
    try {
      await (getCloudflareContext().env as { OUTBOX: { send(m: { at: number }): Promise<void> } }).OUTBOX.send({ at: Date.now() });
    } catch (err) {
      log.warn({ err }, "outbox signal failed");
    }
    return;
  }
  const url = process.env.REDIS_URL;
  if (!url) return;
  if (!pusher) {
    pusher = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    pusher.on("error", () => {});
  }
  await pusher
    .multi()
    .lpush(OUTBOX_SIGNAL_KEY, "1")
    .ltrim(OUTBOX_SIGNAL_KEY, 0, 0)
    .exec()
    .catch((err: unknown) => log.warn({ err }, "outbox signal failed"));
}
