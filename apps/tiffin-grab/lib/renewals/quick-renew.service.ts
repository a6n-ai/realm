import "server-only";
import { and, eq, gt, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { enabledMethods } from "@foundry/payments";
import { db } from "@/db/client";
import { deliveries, deliveryFrequencies, mealSizes, orders, payments, plans } from "@/db/schema";
import { UNSTARTED } from "@/lib/orders/status";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import type { DayOfWeek } from "@/lib/deliveries/schedule/delivery-days";
import { renewSelections } from "@/lib/renewals/renew-selections";
import type { QuickRenewData } from "@/lib/renewals/quick-renew-types";
import { stripeMethodAvailable } from "@/lib/payments/stripe";
import { getPaymentConfig } from "@/lib/payments/payment-config";
import { addressService } from "../services/addresses.service";
import { dropOffsFor } from "../deliveries/address-drop-off.service";
import { checkoutHolidayDates } from "../deliveries/holidays.service";
import { earliestNewPlanStart, lastRunningTiffinDate } from "../orders/order-window";
import { appToday, earliestPlanStart, planStartDays } from "../orders/start-date";
import { utcIso } from "@foundry/commons/util/dates";

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

/**
 * The rail a renewal is quoted and charged on: card when Stripe is live (the pay link needs it), else the source
 * order's own method if still enabled, else the first enabled. One rule for every renewal preview.
 */
export async function defaultPaymentMethodId(sourceMethodId: string | null): Promise<string | null> {
  const enabled = enabledMethods(await getPaymentConfig()).map((m) => m.id);
  return (await stripeMethodAvailable()) ? "stripe"
    : sourceMethodId && enabled.includes(sourceMethodId) ? sourceMethodId
    : (enabled[0] ?? null);
}

async function build(userId: bigint, orgId: string | null, src: Source | null): Promise<QuickRenewData | null> {
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
    checkoutHolidayDates(utcIso(today)),
    dropOffsFor(savedAddresses.map((a) => a.publicId)),
  ]);
  const plan = client.plans.find((p) => p.key === src.planKey);
  if (!plan) return null;
  const freq = client.frequencies.find((f) => f.key === src.frequencyKey);
  const startDate = earliestPlanStart(today, planStartDays(plan.allowedStartDays, freq?.weekdays), minStartDate, new Set(holidayDates));
  const initial = renewSelections(
    client,
    {
      planKey: src.planKey,
      mealSizePublicId: src.mealSizePublicId,
      frequencyKey: src.frequencyKey,
      eatingDays: src.eatingDays as DayOfWeek[] | null,
      durationWeeks: src.durationWeeks,
      trialLength: src.trialLength,
    },
    startDate,
  );
  if (!initial) return null;
  const defaultAddressPublicId = (savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0])?.publicId ?? null;
  return {
    organizationId: orgId,
    defaultPaymentMethodId: await defaultPaymentMethodId(null),
    catalog: client, initial, sourceOrderPublicId: src.publicId, minStartDate, lastTiffin,
    holidayDates, savedAddresses, addressDropOffs, defaultAddressPublicId,
    tagColor: src.tagColor, tagLabel: src.tagLabel,
  };
}

/** Customer path: source = latest-ending renewable, non-trial order. */
export async function loadQuickRenewForCustomer(userId: bigint, orgId: string | null): Promise<QuickRenewData | null> {
  return build(userId, orgId, pickRenewSource(await sourceQuery().where(eq(orders.userId, userId))));
}

type UnpaidRenewal = { publicId: string; deploymentId: string; payPublicId: string | null };

async function queryUnpaidRenewal(userId: bigint, extra: (SQL | undefined)[]): Promise<UnpaidRenewal | null> {
  const [row] = await db
    .select({
      publicId: orders.publicId,
      deploymentId: orders.deploymentId,
      payPublicId: sql<string | null>`(select ${payments.publicId} from ${payments} where ${payments.orderId} = ${orders.id} and ${payments.method} = 'stripe' and ${payments.status} = 'awaiting_payment' and ${payments.addonRequest} is null order by ${payments.id} desc limit 1)`,
    })
    .from(orders)
    .where(and(eq(orders.userId, userId), inArray(orders.status, [...UNSTARTED]), ...extra))
    .limit(1);
  return row ?? null;
}

/**
 * Staff: a later order of the source order's customer, in the source order's own organization, that is not a running
 * plan yet (unpaid or waitlisted). The order page links to it so staff do not stack a duplicate.
 */
export async function findUnpaidRenewal(order: { userId: bigint | null; organizationId: string | null; publicId?: string; startDate?: string }): Promise<UnpaidRenewal | null> {
  if (order.userId == null) return null;
  return queryUnpaidRenewal(order.userId, [
    order.organizationId == null ? isNull(orders.organizationId) : eq(orders.organizationId, order.organizationId),
    order.publicId ? ne(orders.publicId, order.publicId) : undefined,
    order.startDate ? gt(orders.startDate, order.startDate) : undefined,
  ]);
}

/** Customer /me/renew: /me skips org resolution, and the owner's userId already scopes the query, so no org filter. */
export function findUnpaidRenewalForOwner(userId: bigint): Promise<UnpaidRenewal | null> {
  return queryUnpaidRenewal(userId, []);
}
