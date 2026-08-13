import { eq } from "drizzle-orm";
import { memoryBus } from "@realm/realtime/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";

/** SSE channel a user's bell subscribes to. */
export function notifyChannel(userPublicId: string): string {
  return `notify:${userPublicId}`;
}

/**
 * Live "something new" ping. @realm/realtime's message frame carries no payload,
 * so the bell refetches the feed rather than being handed the row — which also
 * keeps the notification body off a transport with no per-frame authorization.
 *
 * Single instance, so the in-process memory bus reaches every open stream. A
 * RedisBus adapter (same Bus interface) is what a second instance would need.
 */
export async function broadcastNotification(input: { userId: bigint }): Promise<void> {
  const [u] = await db
    .select({ publicId: users.publicId })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!u) return;
  const channel = notifyChannel(u.publicId);
  memoryBus.publish(channel, { type: "message", channel });
}
