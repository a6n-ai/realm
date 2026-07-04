import Redis from "ioredis";

const url: string = process.env.REDIS_URL ?? "";
if (!url) throw new Error("REDIS_URL is not set");

// lazyConnect: don't open a socket at import time (build / client-tree safety);
// connects on first command.
const opts = { lazyConnect: true } as const;

let shared: Redis | undefined;

/**
 * Shared Redis connection for the cache L2 tier (get/set/del). Reused across
 * calls. Notifications run on an outbox queue drained by drainPending().
 */
export function getRedis(): Redis {
  return (shared ??= new Redis(url, opts));
}
