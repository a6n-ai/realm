import { eq } from "drizzle-orm";
import { memoryBus } from "@foundry/realtime/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";

/** SSE channel a user's bell subscribes to. */
export function notifyChannel(userPublicId: string): string {
  return `notify:${userPublicId}`;
}

/**
 * Live "something new" ping. @foundry/realtime's message frame carries no payload,
 * so the bell refetches the feed. Single instance → in-process memory bus.
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
