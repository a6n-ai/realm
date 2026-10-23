import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { realtimeBus } from "@/lib/realtime/bus";

/** SSE channel a user's bell subscribes to. */
export function notifyChannel(userPublicId: string): string {
  return `notify:${userPublicId}`;
}

/**
 * Live "something new" ping. @foundry/realtime's message frame carries no payload,
 * so the bell refetches the feed. Worker down must never fail the caller.
 */
export async function broadcastNotification(input: { userId: bigint }): Promise<void> {
  const [u] = await db
    .select({ publicId: users.publicId })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!u) return;
  const channel = notifyChannel(u.publicId);
  try {
    await realtimeBus.publish(channel, { type: "message", channel });
  } catch (e) {
    console.error("broadcastNotification", e);
  }
}
