import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments } from "@/db/schema";
import { zonedRangeMs } from "@/lib/analytics/drill";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  PENDING_STATUSES,
  SETTLED_STATUSES,
  presentPaymentStatuses,
  resolveRevenueBounds,
  summarizeRevenue,
  type PaymentStatusSlice,
  type RevenueSummary,
} from "@/lib/analytics/revenue";
import { ordersMatchFilters, parseAnalyticsFiltersSync } from "./shared-filters";

export type { RevenueSummary, PaymentStatusSlice };

export type RevenueReport = RevenueSummary & { byStatus: PaymentStatusSlice[] };

export type RevenueFilters = {
  from?: string;
  to?: string;
  methods: string[];
  plans: string[];
  mealSizes: string[];
  zones: string[];
};

const PAYMENT_METHODS = payments.method.enumValues;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRevenueFilters(sp: {
  from?: string;
  to?: string;
  method?: string;
  plan?: string;
  mealSize?: string;
  zone?: string;
}): RevenueFilters {
  const bound = (raw: string | undefined) => {
    if (!raw) return undefined;
    if (ISO_DATE.test(raw)) return raw;
    const n = Number(raw);
    return Number.isFinite(n) ? raw : undefined;
  };
  const methods = (sp.method ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((m): m is PaymentMethod => (PAYMENT_METHODS as readonly string[]).includes(m));
  const dims = parseAnalyticsFiltersSync(sp);
  return {
    from: bound(sp.from),
    to: bound(sp.to),
    methods,
    plans: dims.plans,
    mealSizes: dims.mealSizes,
    zones: dims.zones,
  };
}

function dimensionWhere(filters: RevenueFilters) {
  return ordersMatchFilters({
    from: undefined,
    to: undefined,
    plans: filters.plans,
    mealSizes: filters.mealSizes,
    zones: filters.zones,
  });
}

const DAY_PAD = 48 * 60 * 60 * 1000;
const moneyAt = sql<number>`coalesce(${payments.capturedAt}, ${payments.createdAt})`;

export async function getRevenueReport(
  filters: RevenueFilters,
  opts: { now?: number } = {},
): Promise<RevenueReport> {
  const now = opts.now ?? Date.now();
  const { timezone } = await getAppSettings();
  const { from, to } = resolveRevenueBounds(filters.from, filters.to, timezone, now);

  // Padded by two days either side; exact business-day membership is decided in
  // summarizeRevenue once each timestamp is converted to the app timezone.
  const fromMs = Date.parse(`${from}T00:00:00.000Z`) - DAY_PAD;
  const toMs = Date.parse(`${to}T23:59:59.999Z`) + DAY_PAD;
  const window = sql`${moneyAt} between ${fromMs} and ${toMs}`;
  const methodWhere = filters.methods.length
    ? inArray(payments.method, filters.methods as PaymentMethod[])
    : undefined;
  const orderWhere = dimensionWhere(filters);
  // The payments list filters createdAt, so the status breakdown uses the same
  // window. A click on a status then shows exactly the rows that were counted.
  const created = zonedRangeMs(from, to, timezone);

  const [rows, pending, statusRows] = await Promise.all([
    db
      .select({
        orderId: payments.orderId,
        status: payments.status,
        method: payments.method,
        amount: payments.amount,
        at: moneyAt,
        orderTotal: orders.total,
        snapshot: orders.pricingSnapshot,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(and(inArray(payments.status, [...SETTLED_STATUSES, "refunded"]), window, methodWhere, orderWhere)),
    db
      .select({ amount: payments.amount, at: payments.createdAt })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(
        and(
          inArray(payments.status, [...PENDING_STATUSES]),
          sql`${payments.createdAt} between ${fromMs} and ${toMs}`,
          methodWhere,
          orderWhere,
        ),
      ),
    db
      .select({
        status: payments.status,
        count: sql<number>`cast(count(*) as int)`,
        amount: sql<number>`coalesce(sum(${payments.amount}::float8), 0)`,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(
        and(
          gte(payments.createdAt, created.from),
          lte(payments.createdAt, created.to),
          methodWhere,
          orderWhere,
        ),
      )
      .groupBy(payments.status),
  ]);

  const summary = summarizeRevenue({
    from,
    to,
    timezone,
    payments: rows.map((r) => ({
      orderId: String(r.orderId),
      status: r.status,
      method: r.method,
      amount: Number(r.amount),
      at: Number(r.at),
      orderTotal: Number(r.orderTotal),
      snapshot: r.snapshot,
    })),
    pending: pending.map((p) => ({ amount: Number(p.amount), at: Number(p.at) })),
  });

  return {
    ...summary,
    byStatus: presentPaymentStatuses(
      statusRows.map((r) => ({ status: r.status, count: r.count, amount: Number(r.amount) })),
    ),
  };
}

export const REVENUE_METHODS: readonly PaymentMethod[] = PAYMENT_METHODS;
