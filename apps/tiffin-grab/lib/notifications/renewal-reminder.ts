import { RUNNING, inOrderStatuses } from "@/lib/orders/status";
import { orderStatusIn } from "@/lib/orders/status-sql";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { dedupeKeyStartsWith } from "@/lib/notifications/dedupe-prefix";
import { NotFoundError, ValidationError, zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { mealSizes, notificationOutbox, orders, users } from "@/db/schema";
import { formatDateOnly } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { lastTiffinSql, laterOrderSql } from "@/lib/orders/queries";
import { enqueueNotification } from "./enqueue";
import { createLogger } from "@foundry/commons/logger";
import { logReminderSent, openRenewal, reconcileOrders } from "@/lib/services/inquiry-links.service";
import { orderTemplateVars } from "./events";
import { addDaysIso, daysBetween } from "@foundry/commons/util/dates";

const log = createLogger("renewal-reminder");

/** Days before the last tiffin that a reminder goes out. */
export const RENEWAL_REMINDER_DAYS = [5, 1] as const;


export type RenewalCandidate = {
  orderId: bigint;
  orderPublicId: string;
  code: string;
  userId: bigint;
  customerName: string | null;
  mealSize: string | null;
  lastTiffin: string;
};

/** What the template and the outbox row need for one plan; `daysLeft` is 1 or 5. */
export function renewalReminderMessage(c: RenewalCandidate, daysLeft: number) {
  const when = daysLeft === 1 ? "tomorrow" : `on ${formatDateOnly(c.lastTiffin, { mode: "weekdayLong" })}, ${formatDateOnly(c.lastTiffin, { mode: "short" })}`;
  return {
    title: `Your plan ends ${when}`,
    body: "Renew in one tap to keep your tiffins coming.",
    // The plan's end moves when a holiday or pause adds days, so a moved end earns a fresh reminder.
    dedupeKey: `renewal:${c.orderPublicId}:${c.lastTiffin}:${daysLeft}`,
    order: orderTemplateVars(c.code, c.customerName, {
      mealSize: c.mealSize ?? "tiffin",
      lastTiffin: formatDateOnly(c.lastTiffin, { mode: "weekday" }),
      lastTiffinWhen: when,
    }),
  };
}

/**
 * Non-trial plans whose last tiffin is exactly `lastTiffin`, for customers with no later plan of any kind:
 * a running or finished renewal means they already renewed, and an unpaid or waitlisted one gets the
 * payment reminder instead.
 */
async function candidates(lastTiffin: string): Promise<RenewalCandidate[]> {
  const rows = await db
    .select({
      orderId: orders.id,
      orderPublicId: orders.publicId,
      code: orders.deploymentId,
      userId: orders.userId,
      customerName: users.name,
      mealSize: mealSizes.name,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .leftJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .where(and(
      orderStatusIn(RUNNING),
      isNull(orders.trialLength),
      isNotNull(orders.userId),
      eq(users.status, "active"),
      sql`${lastTiffinSql} = ${lastTiffin}`,
      sql`not ${laterOrderSql}`,
    ));
  return rows.map((r) => ({ ...r, userId: r.userId!, lastTiffin }));
}

/** Days ahead of a plan's last tiffin that its inquiry's renewal round opens (trials included). */
export const RENEWAL_ROUND_DAYS = 7;

/** Opens the renewal round on the inquiry of every plan ending between today and RENEWAL_ROUND_DAYS out. */
export async function openRenewalsDue(today: string): Promise<number> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(
      inArray(orders.status, ["active", "paused", "completed"]),
      isNotNull(orders.userId),
      sql`${lastTiffinSql} between ${today} and ${addDaysIso(today, RENEWAL_ROUND_DAYS)}`,
    ));
  let opened = 0;
  for (const r of rows) {
    try {
      if ((await openRenewal(r.id)) === "opened") opened++;
    } catch (err) {
      log.warn({ err, orderId: String(r.id) }, "open renewal round failed");
    }
  }
  return opened;
}

/** Daily: queue each reminder once per plan ending. Safe to rerun; the outbox dedupe key drops repeats. */
export async function sendRenewalReminders(now = Date.now()) {
  const today = zonedDateIso(now, (await getAppSettings()).timezone);
  const summary: Record<string, number> = {};
  // Inquiry bookkeeping must never stop the customer emails below.
  summary.roundsOpened = await openRenewalsDue(today);
  try {
    const repaired = await reconcileOrders(now - 2 * 86_400_000);
    summary.inquiriesLinked = repaired.linked;
    summary.inquiriesRepointed = repaired.repointed;
  } catch (err) {
    log.warn({ err }, "inquiry reconcile failed");
  }
  for (const daysLeft of RENEWAL_REMINDER_DAYS) {
    const plans = await candidates(addDaysIso(today, daysLeft));
    for (const c of plans) {
      const m = renewalReminderMessage(c, daysLeft);
      await db.transaction((tx) =>
        enqueueNotification(tx, {
          event: "order_renewal_reminder",
          recipientId: c.userId,
          title: m.title,
          body: m.body,
          href: "/me/renew",
          data: { order: m.order },
          dedupeKey: m.dedupeKey,
        }),
      );
      await logReminderSent(c.orderId, m.dedupeKey).catch((err) => log.warn({ err, orderId: String(c.orderId) }, "reminder activity failed"));
    }
    summary[`days${daysLeft}`] = plans.length;
  }
  return summary;
}

/**
 * Staff "Send reminder now" from the Renewals page: the same email, for a running plan with no later plan
 * (trials included, as a conversion nudge), at most once a day per plan. Its key reads `staff-<date>` where
 * the daily job writes days-left, so the Renewals page can tell the two apart.
 */
export async function sendRenewalReminderNow(orderPublicId: string, now = Date.now()): Promise<"sent" | "already-sent"> {
  const today = zonedDateIso(now, (await getAppSettings()).timezone);
  const [c] = await db
    .select({
      orderId: orders.id,
      orderPublicId: orders.publicId,
      code: orders.deploymentId,
      userId: orders.userId,
      status: orders.status,
      customerName: users.name,
      mealSize: mealSizes.name,
      lastTiffin: sql<string | null>`${lastTiffinSql}`,
      later: laterOrderSql,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .leftJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!c?.userId) throw new NotFoundError("Order not found");
  if (!inOrderStatuses(RUNNING, c.status) || c.later || !c.lastTiffin || c.lastTiffin < today) {
    throw new ValidationError("Only a running plan with no next plan booked gets a renewal reminder");
  }
  const dedupeKey = `renewal:${c.orderPublicId}:${c.lastTiffin}:staff-${today}`;
  // The engine suffixes the channel onto the key, so match by prefix.
  const [sent] = await db.select({ id: notificationOutbox.id }).from(notificationOutbox).where(dedupeKeyStartsWith(dedupeKey)).limit(1);
  if (sent) return "already-sent";
  const daysLeft = daysBetween(today, c.lastTiffin);
  const m = renewalReminderMessage({ ...c, userId: c.userId, lastTiffin: c.lastTiffin }, daysLeft);
  await db.transaction((tx) =>
    enqueueNotification(tx, {
      event: "order_renewal_reminder",
      recipientId: c.userId!,
      title: m.title,
      body: m.body,
      href: "/me/renew",
      data: { order: m.order },
      dedupeKey,
    }),
  );
  return "sent";
}
