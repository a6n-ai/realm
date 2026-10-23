import type { AppEvent } from "@/db/schema/wallet";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { broadcastNotification } from "./broadcast";

/** Materialize an in-app feed row and ping the user's SSE bell. */
export async function pushInAppNotification(input: {
  userId: bigint;
  event?: AppEvent | null;
  title: string;
  body: string;
  href?: string | null;
}): Promise<{ publicId: string }> {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      event: input.event ?? null,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
    })
    .returning({ publicId: notifications.publicId });
  if (!row) throw new Error("Failed to create notification");
  // Fire-and-forget: a slow Worker must not stall callers that notify in a loop.
  void broadcastNotification({ userId: input.userId }).catch((e) => console.error("broadcastNotification", e));
  return row;
}
