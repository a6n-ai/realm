import { eq } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { db } from "@/db/client";
import { mealSizes, orders, users } from "@/db/schema";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { receiptAttachment } from "./receipt-link";

/** Queue the order's receipt email (PDF attached) to the order's owner. Callers do the access check. */
export async function emailOrderReceipt(orderPublicId: string, now = Date.now()): Promise<void> {
  const [o] = await db
    .select({ publicId: orders.publicId, deploymentId: orders.deploymentId, userId: orders.userId, name: users.name, mealSize: mealSizes.name })
    .from(orders)
    .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .leftJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!o?.userId) throw new NotFoundError("Order not found");
  await db.transaction((tx) =>
    enqueueNotification(tx, {
      event: "order_receipt",
      recipientId: o.userId!,
      title: "Your receipt",
      body: `Receipt for order ${o.deploymentId}`,
      href: "/me/wallet?tab=bills",
      data: { order: { code: o.deploymentId, customerName: o.name ?? "there", mealSize: o.mealSize } },
      attachments: [receiptAttachment(o)],
      // One per order per minute, so repeat taps don't send a stack of the same email.
      dedupeKey: `order_receipt:${o.publicId}:${Math.floor(now / 60_000)}`,
    }),
  );
}
