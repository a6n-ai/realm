// Every plan's renewal facts, from a few flat queries and the rules worked out in JS. The SQL versions
// (renewalStatusSql, laterOrderWhere, effectiveTrackStatusSql) inline correlated subqueries into each
// statement; composed into the renewals filters they grew to 100 KB-1 MB statements that took seconds to
// plan and swapped the database. Keep these rules in step with lib/orders/queries.ts until those go.
import { and, eq, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, inquiries, orders, payments, users } from "@/db/schema";
import type { RenewalStatus } from "@/lib/orders/queries";
import { effectiveTrackStatus, type TrackStatus } from "@/lib/renewals/status";
import type { Visible } from "@/lib/tenant/org-scope";
import type { LostReason } from "@/lib/inquiries/lost-reason";

type OrderStatus = (typeof orders.status.enumValues)[number];

export type PlanFact = {
  id: bigint;
  orderPublicId: string;
  userId: bigint | null;
  status: OrderStatus;
  startDate: string;
  trial: boolean;
  createdAt: number;
  organizationId: string | null;
  currentOwner: bigint | null;
  fullName: string;
  deploymentId: string;
  phone: string | null;
  /** The last non-cancelled delivery date, or null before any is scheduled. */
  last: string | null;
  /** Has a paid (or simulated paid) payment. */
  paid: boolean;
  /** Where the renewal stands: the best later plan by the same customer; trials count only later paid plans (`computedStatusSql`). */
  renewal: RenewalStatus;
  /** The same over every later plan, trials included (`renewalStatusSql()`): the customer page's "next". */
  renewalAny: RenewalStatus;
  /** The first booking among those later plans: when it renewed (`laterBookedAtFor`). */
  laterBookedAtFirst: number | null;
  /** The newest booking among those later plans (`laterBookedAtLatestFor`). */
  laterBookedAtLatest: number | null;
  /** The tracking inquiry's renewal fields (the lowest-id inquiry whose current order this is). */
  trackFollowUpAt: number | null;
  trackLostReason: LostReason | null;
  /** The tracking inquiry's own status, when and who set it (staff or auto), before overrides. */
  trackStaff: TrackStatus | null;
  trackStaffSetAt: number | null;
  trackStaffSource: "staff" | "auto" | null;
  /** Staff or auto status after a later booking overrides it (`effectiveTrackStatus`). */
  track: TrackStatus | null;
};

// "Later" plan statuses: cancelled never counts (laterOrderWhere).
const LATER: ReadonlySet<OrderStatus> = new Set(["pending", "waitlisted", "active", "paused", "completed"]);
const RUNNING_OR_DONE: ReadonlySet<OrderStatus> = new Set(["active", "paused", "completed"]);

type Base = Omit<PlanFact, "renewal" | "renewalAny" | "laterBookedAtFirst" | "laterBookedAtLatest" | "track">;

/** Later plans: same customer, another plan, starts after this one and runs at least as long. A plan with no tiffins yet counts. */
function laterPlans(o: Base, byUser: Map<string, Base[]>): Base[] {
  if (o.userId == null) return [];
  const mine = o.last ?? "0001-01-01";
  return (byUser.get(String(o.userId)) ?? []).filter(
    (n) => n.id !== o.id && LATER.has(n.status) && n.startDate > o.startDate && (n.last ?? "9999-12-31") >= mine,
  );
}

/** Running, finished or paid wins over unpaid, which wins over waitlisted. Trials only count later paid (non-trial) plans. */
export function renewalOf(later: readonly Pick<Base, "status" | "paid">[]): RenewalStatus {
  if (later.some((n) => RUNNING_OR_DONE.has(n.status) || n.paid)) return "renewed";
  if (later.some((n) => n.status === "pending")) return "unpaid";
  if (later.some((n) => n.status === "waitlisted")) return "waitlisted";
  return "none";
}

/**
 * Facts for every plan, or only for `forOrders` and their customers' other plans (all a plan's rules need).
 * Later plans are looked up across organizations, as the SQL rule does.
 */
export async function loadPlanFacts(forOrders?: readonly string[]): Promise<PlanFact[]> {
  let scope: SQL | undefined;
  let byOrder: (col: typeof deliveries.orderId | typeof payments.orderId | typeof inquiries.currentOrderId) => SQL | undefined = () => undefined;
  if (forOrders) {
    if (!forOrders.length) return [];
    // The customers are a subquery, so scoping costs no extra round trip.
    const owners = db.select({ userId: orders.userId }).from(orders).where(inArray(orders.publicId, [...forOrders]));
    scope = or(inArray(orders.publicId, [...forOrders]), inArray(orders.userId, owners));
    const ids = db.select({ id: orders.id }).from(orders).where(scope);
    byOrder = (col) => inArray(col, ids);
  }
  const [rows, lasts, paid, tracks] = await Promise.all([
    db
      .select({
        orderPublicId: orders.publicId,
        id: orders.id, userId: orders.userId, status: orders.status, startDate: orders.startDate, trialLength: orders.trialLength,
        createdAt: orders.createdAt, organizationId: orders.organizationId, currentOwner: orders.currentOwner,
        fullName: orders.fullName, deploymentId: orders.deploymentId, phone: users.phone,
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id))
      .where(scope),
    db
      .select({ orderId: deliveries.orderId, last: sql<string>`max(${deliveries.deliveryDate})` })
      .from(deliveries)
      .where(and(ne(deliveries.status, "cancelled"), byOrder(deliveries.orderId)))
      .groupBy(deliveries.orderId),
    db.selectDistinct({ orderId: payments.orderId }).from(payments).where(and(inArray(payments.status, ["paid", "simulated_paid"]), byOrder(payments.orderId))),
    db
      .select({
        orderId: inquiries.currentOrderId, id: inquiries.id, status: inquiries.renewalStatus, setAt: inquiries.renewalStatusSetAt,
        source: inquiries.renewalStatusSource, followUpAt: inquiries.renewalFollowUpAt, lostReason: inquiries.renewalLostReason,
      })
      .from(inquiries)
      .where(and(isNotNull(inquiries.currentOrderId), byOrder(inquiries.currentOrderId))),
  ]);
  const lastBy = new Map(lasts.map((l) => [String(l.orderId), l.last]));
  const paidBy = new Set(paid.map((p) => String(p.orderId)));
  const trackBy = new Map<string, (typeof tracks)[number]>();
  for (const t of tracks) {
    const k = String(t.orderId), cur = trackBy.get(k);
    if (!cur || t.id < cur.id) trackBy.set(k, t);
  }

  const base: Base[] = rows.map((o) => {
    const k = String(o.id), t = trackBy.get(k);
    return {
      id: o.id, orderPublicId: o.orderPublicId, userId: o.userId, status: o.status, startDate: o.startDate, trial: o.trialLength != null,
      createdAt: Number(o.createdAt), organizationId: o.organizationId, currentOwner: o.currentOwner,
      fullName: o.fullName, deploymentId: o.deploymentId, phone: o.phone,
      last: lastBy.get(k) ?? null, paid: paidBy.has(k),
      trackFollowUpAt: t?.followUpAt == null ? null : Number(t.followUpAt),
      trackLostReason: t?.lostReason ?? null,
      trackStaff: (t?.status as TrackStatus | null) ?? null, trackStaffSetAt: t?.setAt == null ? null : Number(t.setAt), trackStaffSource: t?.source ?? null,
    };
  });
  const byUser = new Map<string, Base[]>();
  for (const o of base) if (o.userId != null) (byUser.get(String(o.userId)) ?? byUser.set(String(o.userId), []).get(String(o.userId))!).push(o);

  return base.map((o) => {
    const any = laterPlans(o, byUser);
    // Trials count only later paid (non-trial) plans.
    const later = o.trial ? any.filter((n) => !n.trial) : any;
    const renewal = renewalOf(later);
    const renewalAny = renewalOf(any);
    const laterBookedAtFirst = later.length ? Math.min(...later.map((n) => n.createdAt)) : null;
    const laterBookedAtLatest = later.length ? Math.max(...later.map((n) => n.createdAt)) : null;
    const track = effectiveTrackStatus({ staff: o.trackStaff, staffSetAt: o.trackStaffSetAt, staffSource: o.trackStaffSource, computed: renewal, laterBookedAt: laterBookedAtLatest }).status;
    return { ...o, renewal, renewalAny, laterBookedAtFirst, laterBookedAtLatest, track };
  });
}

export const visibleTo = (visible: Visible) => (p: PlanFact) =>
  visible === "all" || (p.organizationId != null && visible.includes(p.organizationId));

/** A plan owner's internal id from their publicId, for owner filters over facts. */
export async function ownerIdOf(publicId: string): Promise<bigint | null> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return u?.id ?? null;
}
