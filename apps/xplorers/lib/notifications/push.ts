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
  await broadcastNotification({ userId: input.userId });
  return row;
}
