import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { realtimeBus } from "@/lib/realtime/bus";
import { realtimeConfig } from "@/lib/realtime/config";
import { NOTIFY_PING_CHANNEL, notifyChannel } from "@/lib/realtime/notify";

/**
 * Live "new notification" ping for the bell. The feed row is written by the outbox drainer,
 * which runs in a different process from the web server that holds the SSE streams, so the
 * ping crosses processes over Redis (see lib/realtime/notify-bridge.ts). The frame carries
 * only the recipient; the bell refetches its feed. Best-effort: the row is already durable
 * and the bell also refetches on focus. With a realtime Worker configured (Workers deploy)
 * the ping goes straight to it instead; Redis stays the Node/EC2 path.
 */
export interface BroadcastInput {
  userId: bigint;
  publicId: string;
  /** Null for a campaign notification, which has no business event. */
  event: string | null;
  title: string;
  body: string;
  href: string | null;
}

export async function broadcast(input: BroadcastInput): Promise<void> {
  const viaWorker = realtimeConfig() !== null;
  if (!viaWorker && !process.env.REDIS_URL) return;
  try {
    const [u] = await db.select({ publicId: users.publicId }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!u) return;
    if (viaWorker) {
      const channel = notifyChannel(u.publicId);
      await realtimeBus.publish(channel, { type: "message", channel });
      return;
    }
    const { getRedis } = await import("@/lib/redis");
    await getRedis().publish(NOTIFY_PING_CHANNEL, u.publicId);
  } catch {
    /* best-effort */
  }
}
