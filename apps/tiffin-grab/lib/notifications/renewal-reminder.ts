import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { mealSizes, orders, users } from "@/db/schema";
import { formatDateOnly } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { lastTiffinSql } from "@/lib/services/orders.service";
import { enqueueNotification } from "./enqueue";

/** Days before the last tiffin that a reminder goes out. */
export const RENEWAL_REMINDER_DAYS = [5, 1] as const;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type RenewalCandidate = {
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
    order: {
      code: c.code,
      customerName: c.customerName ?? "",
      mealSize: c.mealSize ?? "tiffin",
      lastTiffin: formatDateOnly(c.lastTiffin, { mode: "weekday" }),
      lastTiffinWhen: when,
    },
  };
}

/**
 * Weekly plans whose last tiffin is exactly `lastTiffin`, for customers with no later plan of any kind:
 * a running or finished renewal means they already renewed, and an unpaid or waitlisted one gets the
 * payment reminder instead.
 */
async function candidates(lastTiffin: string): Promise<RenewalCandidate[]> {
  const rows = await db
    .select({
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
      inArray(orders.status, ["active", "paused"]),
      isNull(orders.trialLength),
      isNotNull(orders.userId),
      eq(users.status, "active"),
      sql`${lastTiffinSql} = ${lastTiffin}`,
      sql`not exists (select 1 from ${orders} as next_order where next_order.user_id = ${orders.userId} and next_order.id <> ${orders.id} and next_order.status in ('pending', 'waitlisted', 'active', 'paused', 'completed') and next_order.start_date > ${orders.startDate})`,
    ));
  return rows.map((r) => ({ ...r, userId: r.userId!, lastTiffin }));
}

/** Daily: queue each reminder once per plan ending. Safe to rerun; the outbox dedupe key drops repeats. */
export async function sendRenewalReminders(now = Date.now()) {
  const today = zonedDateIso(now, (await getAppSettings()).timezone);
  const summary: Record<string, number> = {};
  for (const daysLeft of RENEWAL_REMINDER_DAYS) {
    const plans = await candidates(addDays(today, daysLeft));
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
    }
    summary[`days${daysLeft}`] = plans.length;
  }
  return summary;
}
