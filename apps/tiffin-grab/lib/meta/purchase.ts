import { asc, eq } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { mealSizes, orders, payments, plans, users } from "@/db/schema";
import type { MetaAttribution } from "./types";
import { sendMetaEventAwait } from "./capi";

const log = createLogger("meta-purchase");

/**
 * Exactly-once Purchase CAPI for a conversion.
 * Offline methods fire on customer claim (`pending_verification`) — ads conversion
 * at proof/reference submit; money still settles later on staff verify. Card fires
 * on settle (`paid` / `simulated_paid`). Claims `metaPurchaseSentAt` before the
 * network call so claim + verify / webhook retries cannot double-fire. Skips
 * renewals (`metaPurchaseEligible = false`) and any payment that is not the
 * order's first payment. Never reads headers/cookies — attribution must already
 * be on the order from checkout. Awaits the Graph POST so Workers keep the isolate
 * alive through the send.
 */
const PURCHASE_STATUSES = new Set(["pending_verification", "paid", "simulated_paid"]);

export async function sendMetaPurchaseOnce(paymentPublicId: string): Promise<void> {
  try {
    const claimed = await db.transaction(async (tx) => {
      const [pay] = await tx
        .select()
        .from(payments)
        .where(eq(payments.publicId, paymentPublicId))
        .for("update")
        .limit(1);
      if (!pay) return null;
      if (pay.metaPurchaseSentAt != null) return null;
      if (!PURCHASE_STATUSES.has(pay.status)) return null;

      const [first] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.orderId, pay.orderId))
        .orderBy(asc(payments.createdAt), asc(payments.id))
        .limit(1);
      if (!first || first.id !== pay.id) return null;

      const [order] = await tx.select().from(orders).where(eq(orders.id, pay.orderId)).limit(1);
      if (!order) return null;
      if (!order.metaPurchaseEligible) {
        log.info({ paymentPublicId, orderId: order.publicId }, "meta purchase skipped: renewal");
        return null;
      }

      const attr = (order.metaAttribution ?? null) as MetaAttribution | null;
      // Do not claim the stamp when consent was denied — a later verify with consent
      // still cannot recover, but we must not burn the once-flag on a no-op send.
      if (attr?.consent === false) {
        log.info({ paymentPublicId }, "meta purchase skipped: no analytics consent");
        return null;
      }

      const claimedAt = Date.now();
      await tx.update(payments).set({ metaPurchaseSentAt: claimedAt }).where(eq(payments.id, pay.id));

      const [user] = order.userId
        ? await tx
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

      const [meal] = await tx
        .select({ key: mealSizes.key, publicId: mealSizes.publicId })
        .from(mealSizes)
        .where(eq(mealSizes.id, order.mealSizeId))
        .limit(1);
      const [plan] = await tx.select({ key: plans.key }).from(plans).where(eq(plans.id, order.planId)).limit(1);

      return { pay, order, user, meal, plan, claimedAt, attr };
    });

    if (!claimed) return;

    const value = Number(claimed.pay.amount) + Number(claimed.pay.surchargeAmount ?? 0);
    const settledMs = claimed.pay.capturedAt ?? claimed.pay.claimedAt ?? claimed.claimedAt;
    const contentIds = [claimed.plan?.key, claimed.meal?.key ?? claimed.meal?.publicId].filter(
      (x): x is string => !!x,
    );
    const attr = claimed.attr;

    await sendMetaEventAwait({
      eventName: "Purchase",
      eventId: claimed.pay.publicId,
      eventSourceUrl: attr?.eventSourceUrl,
      eventTime: Math.floor(settledMs / 1000),
      userData: {
        email: claimed.user?.email,
        phone: claimed.user?.phone,
        fullName: claimed.order.fullName || claimed.user?.name,
        city: claimed.order.city,
        province: claimed.user?.province,
        postalCode: claimed.order.postalCode,
        country: "ca",
        externalId: claimed.user?.publicId,
        clientIpAddress: attr?.clientIpAddress,
        clientUserAgent: attr?.clientUserAgent,
        fbp: attr?.fbp,
        fbc: attr?.fbc,
      },
      customData: {
        value,
        currency: "CAD",
        ...(contentIds.length ? { content_ids: contentIds, content_type: "product" } : {}),
        num_items: claimed.order.tiffinCount,
      },
    });
  } catch (err) {
    log.error({ err, paymentPublicId }, "meta purchase claim/send failed");
  }
}
