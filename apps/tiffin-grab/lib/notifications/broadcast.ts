import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { realtimeBus } from "@/lib/realtime/bus";
import { realtimeConfigFromEnv } from "@foundry/realtime/server";
import { notifyChannel } from "@/lib/realtime/notify";

/**
 * Live "new notification" ping for the bell, sent straight to the realtime Worker. The frame
 * carries only the recipient; the bell refetches its feed. Best-effort: the row is already
 * durable and the bell also refetches on focus. Without a realtime Worker configured (dev) it
 * does nothing.
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
  if (realtimeConfigFromEnv() === null) return;
  try {
    const [u] = await db.select({ publicId: users.publicId }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!u) return;
    const channel = notifyChannel(u.publicId);
    await realtimeBus.publish(channel, { type: "message", channel });
  } catch (err) {
    console.error("broadcast", err);
  }
}
