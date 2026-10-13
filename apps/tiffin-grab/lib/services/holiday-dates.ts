import { ValidationError } from "@foundry/commons";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { holidays, orders } from "@/db/schema";
import { humanDate } from "@/lib/deliveries-view";

export type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
export type HolidayDay = { id: bigint; date: string; name: string };

/** Holidays on or after `from` for one organization, keyed by ISO date. */
export async function upcomingHolidays(tx: Db, organizationId: string | null, from: string): Promise<Map<string, HolidayDay>> {
  if (!organizationId) return new Map();
  const rows = await tx.select({ id: holidays.id, date: holidays.date, name: holidays.name }).from(holidays)
    .where(and(eq(holidays.organizationId, organizationId), gte(holidays.date, from)));
  return new Map(rows.map((r) => [r.date, r]));
}

/** The holiday closing `date` for this order's organization, if any. */
export async function holidayForOrderDate(tx: Db, orderId: bigint, date: string): Promise<HolidayDay | null> {
  const [row] = await tx.select({ id: holidays.id, date: holidays.date, name: holidays.name }).from(holidays)
    .innerJoin(orders, eq(orders.organizationId, holidays.organizationId))
    .where(and(eq(orders.id, orderId), eq(holidays.date, date))).limit(1);
  return row ?? null;
}

/** A plan cannot start on a day its organization is closed. */
export async function assertStartNotHoliday(tx: Db, organizationId: string | null, startDate: string): Promise<void> {
  const holiday = (await upcomingHolidays(tx, organizationId, startDate)).get(startDate);
  if (holiday) throw new ValidationError(`We are closed on ${humanDate(startDate)} (${holiday.name}). Pick another start date`);
}
