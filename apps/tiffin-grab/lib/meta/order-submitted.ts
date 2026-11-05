import { eq } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import type { MetaEventName } from "@foundry/meta-pixel";
import { db } from "@/db/client";
import { mealSizes, orders, payments, plans, users } from "@/db/schema";
import type { MetaAttribution } from "./types";
import { sendMetaEventAwait } from "./capi";
import { orderSubmittedEventId } from "./event-ids";

const log = createLogger("meta-order-submitted");

export { orderSubmittedEventId };

/**
 * Offline claim funnel event (not Purchase). Fires when the customer submits
 * proof/reference (`pending_verification`). Purchase waits for staff/provider settle.
 * Uses checkout-stored attribution — never claim-request headers. Skips when
 * analytics consent was denied at checkout.
 */
export async function sendMetaOrderSubmitted(paymentPublicId: string): Promise<void> {
  try {
    const [pay] = await db.select().from(payments).where(eq(payments.publicId, paymentPublicId)).limit(1);
    if (!pay) return;
    if (pay.status !== "pending_verification") return;

    const [order] = await db.select().from(orders).where(eq(orders.id, pay.orderId)).limit(1);
    if (!order) return;

    const attr = (order.metaAttribution ?? null) as MetaAttribution | null;
    if (attr?.consent === false) {
      log.info({ paymentPublicId }, "meta order_submitted skipped: no analytics consent");
      return;
    }

    const [user] = order.userId
      ? await db
          .select({
            publicId: users.publicId,
            email: users.email,
            phone: users.phone,
            name: users.name,
            province: users.province,
          })
          .from(users)
          .where(eq(users.id, order.userId))
          .limit(1)
      : [null];

    const [meal] = await db
      .select({ key: mealSizes.key, publicId: mealSizes.publicId })
      .from(mealSizes)
      .where(eq(mealSizes.id, order.mealSizeId))
      .limit(1);
    const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.id, order.planId)).limit(1);

    const value = Number(pay.amount) + Number(pay.surchargeAmount ?? 0);
    const contentIds = [plan?.key, meal?.key ?? meal?.publicId].filter((x): x is string => !!x);
    const eventTime = Math.floor((pay.claimedAt ?? Date.now()) / 1000);

    await sendMetaEventAwait({
      // Custom funnel event; Foundry's MetaEventName union only lists standard names.
      eventName: "order_submitted" as MetaEventName,
      eventId: orderSubmittedEventId(pay.publicId),
      eventSourceUrl: attr?.eventSourceUrl,
      eventTime,
      userData: {
        email: user?.email,
        phone: user?.phone,
        fullName: order.fullName || user?.name,
        city: order.city,
        province: user?.province,
        postalCode: order.postalCode,
        country: "ca",
        externalId: user?.publicId,
        clientIpAddress: attr?.clientIpAddress,
        clientUserAgent: attr?.clientUserAgent,
        fbp: attr?.fbp,
        fbc: attr?.fbc,
      },
      customData: {
        value,
        currency: "CAD",
        order_id: order.publicId,
        ...(contentIds.length ? { content_ids: contentIds, content_type: "product" } : {}),
        num_items: order.tiffinCount,
      },
    });
  } catch (err) {
    log.error({ err, paymentPublicId }, "meta order_submitted send failed");
  }
}
