import { memoryBus } from "@foundry/realtime/server";
import { NOTIFY_PING_CHANNEL, notifyChannel } from "./notify";

let started: Promise<void> | null = null;

/**
 * Forwards Redis notify pings into this process's SSE bus. Started lazily by the first bell
 * stream, so no work happens at import or build time and processes without streams (the
 * drainer worker) never subscribe. Retries on the next stream if Redis was unreachable.
 */
export function ensureNotifyBridge(): Promise<void> {
  if (!process.env.REDIS_URL) return Promise.resolve();
  started ??= (async () => {
    const { getRedis } = await import("@/lib/redis");
    const sub = getRedis().duplicate();
    sub.on("error", () => {});
    sub.on("message", (_channel, userPublicId) => {
      const channel = notifyChannel(userPublicId);
      memoryBus.publish(channel, { type: "message", channel });
    });
    await sub.subscribe(NOTIFY_PING_CHANNEL);
  })().catch((err) => {
    started = null;
    throw err;
  });
  return started;
}
