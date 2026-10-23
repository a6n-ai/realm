import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { customerAddresses, deliveries, deliveryFrequencies, mealSizes, orders, plans } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { renewSelections } from "@/components/renew/renew-selections";
import type { QuickRenewData } from "@/components/renew/types";
import { addressService } from "./addresses.service";
import { dropOffsFor } from "./address-drop-off.service";
import { checkoutHolidayDates } from "./holidays.service";
import { earliestNewPlanStart, lastRunningTiffinDate } from "./order-window";
import { appToday, earliestPlanStart } from "./start-date";

export type { QuickRenewData };

const RENEWABLE = new Set(["active", "paused", "upcoming", "completed"]);

/** The renewable order that ends last: running plans lose to a queued one that ends later. */
export function pickRenewSource<T extends { status: string; trialLength: number | null; endDate: string | null }>(rows: T[]): T | null {
  const eligible = rows.filter((r) => RENEWABLE.has(r.status) && r.trialLength == null);
  eligible.sort((a, b) => (b.endDate ?? "").localeCompare(a.endDate ?? ""));
  return eligible[0] ?? null;
}

const lastDelivery = sql<string | null>`(select max(${deliveries.deliveryDate}) from ${deliveries} where ${deliveries.orderId} = ${orders.id} and ${deliveries.status} <> 'cancelled')`;

const sourceColumns = {
  publicId: orders.publicId,
  status: orders.status,
  trialLength: orders.trialLength,
  endDate: lastDelivery,
  addressPublicId: sql<string | null>`(select ${customerAddresses.publicId} from ${customerAddresses} where ${customerAddresses.id} = ${orders.addressId})`,
  organizationId: orders.organizationId,
  planKey: plans.key,
  tagColor: plans.tagColor,
  tagLabel: plans.tagLabel,
  mealSizePublicId: mealSizes.publicId,
  frequencyKey: deliveryFrequencies.key,
  eatingDays: orders.eatingDays,
  durationWeeks: orders.durationWeeks,
};

function sourceQuery() {
  return db
    .select(sourceColumns)
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id));
}

type Source = Awaited<ReturnType<typeof sourceQuery>>[number];

async function build(userId: bigint, orgId: string | null, src: Source | null, staff: boolean): Promise<QuickRenewData | null> {
  if (!src) return null;
  const [catalog, minStartDate, lastTiffin, savedAddresses] = await Promise.all([
    loadCatalogSnapshot(orgId),
    earliestNewPlanStart(db, userId),
    lastRunningTiffinDate(db, userId),
    addressService.list({ userId, orgId }),
  ]);
  const client = toClientCatalog(catalog);
  const today = appToday(client.timezone, client.cutoffHour);
  const [holidayDates, addressDropOffs] = await Promise.all([
    checkoutHolidayDates(today.toISOString().slice(0, 10)),
    dropOffsFor(savedAddresses.map((a) => a.publicId)),
  ]);
  const plan = client.plans.find((p) => p.key === src.planKey);
  if (!plan) return null;
  const startDate = earliestPlanStart(today, plan.allowedStartDays, minStartDate, new Set(holidayDates));
  const initial = renewSelections(
    client,
    {
      planKey: src.planKey,
      mealSizePublicId: src.mealSizePublicId,
      frequencyKey: src.frequencyKey,
      eatingDays: (src.eatingDays ?? []) as DayOfWeek[],
      durationWeeks: src.durationWeeks,
      trialLength: src.trialLength,
    },
    startDate,
  );
  if (!initial) return null;
  const defaultAddressPublicId = staff
    ? (savedAddresses.find((a) => a.publicId === src.addressPublicId)?.publicId ?? null)
    : (savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0])?.publicId ?? null;
  return {
    catalog: client, initial, sourceOrderPublicId: src.publicId, minStartDate, lastTiffin,
    holidayDates, savedAddresses, addressDropOffs, defaultAddressPublicId,
    tagColor: src.tagColor, tagLabel: src.tagLabel,
  };
}

/** Customer path: source = latest-ending renewable, non-trial order. */
export async function loadQuickRenewForCustomer(userId: bigint, orgId: string | null): Promise<QuickRenewData | null> {
  return build(userId, orgId, pickRenewSource(await sourceQuery().where(eq(orders.userId, userId))), false);
}

/** Staff path: source = this order; the start-date window is still customer-wide. */
export async function loadQuickRenewForOrder(orderPublicId: string): Promise<QuickRenewData | null> {
  const [src] = await sourceQuery().where(eq(orders.publicId, orderPublicId)).limit(1);
  if (!src) return null;
  const [row] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.publicId, orderPublicId)).limit(1);
  if (row?.userId == null) return null;
  return build(row.userId, src.organizationId, src, true);
}
