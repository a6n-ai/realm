/**
 * One-off repair: the WordPress migration (db/migrate-wordpress-customers.ts)
 * used nextWeekday() for orders.startDate — the same "no same-day, must be a
 * future weekday" rule that applies to brand-new checkout signups. That's
 * wrong for a migration of already-active real customers: it skipped today
 * (Fri) entirely and started them on the following Monday, losing a real
 * delivery day. Since Friday is a base day for both frequencies (5_day and
 * mwf both include it) and today is before the cutoff, every migrated order
 * should start today instead.
 *
 * Regenerates delivery rows for every order tagged "Migrated from WordPress
 * export", starting from TODAY_ISO instead of the original startDate, using
 * the exact same bounded-generation logic as the migration (same total
 * tiffinCount, just starting 3 days earlier).
 *
 * Usage: TODAY_ISO=2026-08-14 DATABASE_URL=... tsx db/repair-migration-start-date.ts [--apply]
 */
import { eq } from "drizzle-orm";
import { cutoffMsFor } from "@foundry/commons";
import { db } from "./client";
import { deliveries, deliveryFrequencies, orderActivities, orders } from "./schema";
import { getAppSettings } from "../lib/services/app-settings.service";
import { orderDeliveryDays } from "../lib/menu/delivery-days";
import { buildBoundedDeliveryRows } from "./migrate-wordpress-customers";

const MIGRATION_TAG = "Migrated from WordPress export";

async function main() {
  const isApply = process.argv.includes("--apply");
  const todayIso = process.env.TODAY_ISO;
  if (!todayIso) throw new Error("TODAY_ISO env var is required (e.g. 2026-08-14)");

  const migratedOrderIds = await db
    .selectDistinct({ orderId: orderActivities.orderId })
    .from(orderActivities)
    .where(eq(orderActivities.note, MIGRATION_TAG));

  console.log(`Found ${migratedOrderIds.length} migrated orders.`);

  const freqRows = await db.select({ id: deliveryFrequencies.id, key: deliveryFrequencies.key }).from(deliveryFrequencies);
  const freqKeyById = new Map(freqRows.map((f) => [f.id, f.key]));
  const { timezone, cutoffHour } = await getAppSettings();

  let changed = 0;
  let alreadyStartsToday = 0;
  let failed = 0;

  for (const { orderId } of migratedOrderIds) {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) {
      failed++;
      console.log(`  FAIL order ${orderId}: not found`);
      continue;
    }
    if (order.startDate === todayIso && !process.argv.includes("--force")) {
      alreadyStartsToday++;
      continue;
    }

    const frequencyKey = freqKeyById.get(order.frequencyId);
    if (!frequencyKey) {
      failed++;
      console.log(`  FAIL ${order.publicId}: unknown frequencyId ${order.frequencyId}`);
      continue;
    }

    const deliveryDays = orderDeliveryDays({
      frequencyKey,
      includeSaturday: order.includeSaturday,
      includeSunday: order.includeSunday,
    });
    const rows = buildBoundedDeliveryRows({
      startDate: todayIso,
      deliveryDays,
      persons: order.persons,
      targetTiffinCount: order.tiffinCount,
    });

    if (!isApply) {
      console.log(`  WOULD FIX ${order.publicId}: ${order.startDate} -> ${todayIso}, ${rows.length} rows (${rows[0]?.deliveryDate}..${rows[rows.length - 1]?.deliveryDate})`);
      changed++;
      continue;
    }

    await db.transaction(async (tx) => {
      await tx.delete(deliveries).where(eq(deliveries.orderId, order.id));
      await tx.insert(deliveries).values(
        rows.map((r) => ({
          orderId: order.id,
          deliveryDate: r.deliveryDate,
          status: "scheduled" as const,
          cutoffAt: cutoffMsFor(r.deliveryDate, cutoffHour, timezone),
          tiffinUnits: r.tiffinUnits,
        })),
      );
      await tx.update(orders).set({ startDate: todayIso }).where(eq(orders.id, order.id));
    });
    changed++;
    console.log(`  FIXED ${order.publicId}: ${rows.length} rows (${rows[0]?.deliveryDate}..${rows[rows.length - 1]?.deliveryDate})`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Already starting ${todayIso}: ${alreadyStartsToday}`);
  console.log(`${isApply ? "Fixed" : "Would fix"}: ${changed}`);
  console.log(`Failed: ${failed}`);
  if (!isApply) console.log(`\nDry run only — pass --apply to write.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
