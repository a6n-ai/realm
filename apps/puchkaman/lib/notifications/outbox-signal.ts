import Redis from "ioredis";
import { createLogger } from "@foundry/commons/logger";

const log = createLogger("outbox-signal");

// The outbox row is the record; this list only says "look now". LTRIM keeps it
// at one entry, so a burst of enqueues wakes the listener once and a single
// drainPending() picks up every row.
export const OUTBOX_SIGNAL_KEY = "notify:outbox";

let pusher: Redis | undefined;

/**
 * Wake the outbox listener. Fire-and-forget: a lost signal only delays the mail
 * until the next signal or a server restart (which drains pending rows), so it
 * never fails the caller.
 */
export function signalOutbox(): void {
  const url = process.env.REDIS_URL;
  if (!url) return;
  if (!pusher) {
    pusher = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    pusher.on("error", () => {});
  }
  pusher
    .multi()
    .lpush(OUTBOX_SIGNAL_KEY, "1")
    .ltrim(OUTBOX_SIGNAL_KEY, 0, 0)
    .exec()
    .catch((err: unknown) => log.warn({ err }, "outbox signal failed"));
}
