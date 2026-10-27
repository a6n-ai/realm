import "server-only";
import { and, eq, gt, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { enabledMethods } from "@foundry/payments";
import { db } from "@/db/client";
import { customerAddresses, deliveries, deliveryFrequencies, mealSizes, orders, payments, plans, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { renewSelections } from "@/components/renew/renew-selections";
import type { QuickRenewData } from "@/components/renew/types";
import { stripeMethodAvailable } from "@/lib/payments/stripe";
import { getPaymentConfig } from "./app-settings.service";
import { addressService } from "./addresses.service";
import { dropOffsFor } from "./address-drop-off.service";
import { checkoutHolidayDates } from "./holidays.service";
import { earliestNewPlanStart, lastRunningTiffinDate } from "./order-window";
import { appToday, earliestPlanStart, planStartDays } from "./start-date";

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
  sourceMethodId: sql<string | null>`${orders.pricingSnapshot}->>'paymentMethodId'`,
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
 * order's own method if still enabled, else the first enabled. One rule for the preview and renewOrderAction.
 */
export async function defaultPaymentMethodId(sourceMethodId: string | null): Promise<string | null> {
  const enabled = enabledMethods(await getPaymentConfig()).map((m) => m.id);
  return (await stripeMethodAvailable()) ? "stripe"
    : sourceMethodId && enabled.includes(sourceMethodId) ? sourceMethodId
    : (enabled[0] ?? null);
}

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
  const defaultAddressPublicId = staff
    ? (savedAddresses.find((a) => a.publicId === src.addressPublicId)?.publicId ?? null)
    : (savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0])?.publicId ?? null;
  return {
    organizationId: orgId,
    defaultPaymentMethodId: await defaultPaymentMethodId(staff ? src.sourceMethodId : null),
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

type UnpaidRenewal = { publicId: string; deploymentId: string; payPublicId: string | null };

async function queryUnpaidRenewal(userId: bigint, extra: (SQL | undefined)[]): Promise<UnpaidRenewal | null> {
  const [row] = await db
    .select({
      publicId: orders.publicId,
      deploymentId: orders.deploymentId,
      payPublicId: sql<string | null>`(select ${payments.publicId} from ${payments} where ${payments.orderId} = ${orders.id} and ${payments.method} = 'stripe' and ${payments.status} = 'awaiting_payment' and ${payments.addonRequest} is null order by ${payments.id} desc limit 1)`,
    })
    .from(orders)
    .where(and(eq(orders.userId, userId), inArray(orders.status, ["pending", "waitlisted"]), ...extra))
    .limit(1);
  return row ?? null;
}

/**
 * Staff: a later order of the source order's customer, in the source order's own organization, that is not a running
 * plan yet (unpaid or waitlisted). Renewing again would stack a duplicate on it, so the order page and renewOrderAction refuse.
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

/** What a staff renewal takes from the source order, never from the client: owner, contact, plan, address. */
export async function loadRenewContext(orderPublicId: string) {
  const [row] = await db
    .select({
      publicId: orders.publicId,
      userId: orders.userId,
      startDate: orders.startDate,
      planKey: plans.key,
      organizationId: orders.organizationId,
      status: orders.status,
      trialLength: orders.trialLength,
      sourceMethodId: sql<string | null>`${orders.pricingSnapshot}->>'paymentMethodId'`,
      ownerPublicId: users.publicId,
      ownerName: users.name,
      email: users.email,
      phone: users.phone,
      fullName: orders.fullName,
      addressLine: orders.addressLine,
      city: orders.city,
      postalCode: orders.postalCode,
      addressPublicId: sql<string | null>`(select ${customerAddresses.publicId} from ${customerAddresses} where ${customerAddresses.id} = ${orders.addressId})`,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  return row ?? null;
}

/** The source order's plan as wizard picks (plan, size, days, persons), so a renewal never trusts those from the client. */
export async function loadRenewSourceSelections(orderPublicId: string, startDate: string) {
  const [src] = await sourceQuery().where(eq(orders.publicId, orderPublicId)).limit(1);
  if (!src) return null;
  const client = toClientCatalog(await loadCatalogSnapshot(src.organizationId));
  return renewSelections(
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
}
