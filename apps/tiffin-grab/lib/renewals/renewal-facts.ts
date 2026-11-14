// Every plan's renewal facts, from a few flat queries and the rules worked out in JS. The SQL versions
// (renewalStatusSql, laterOrderWhere, effectiveTrackStatusSql) inline correlated subqueries into each
// statement; composed into the renewals filters they grew to 100 KB-1 MB statements that took seconds to
// plan and swapped the database. Keep these rules in step with lib/orders/queries.ts until those go.
import { eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, inquiries, orders, payments, users } from "@/db/schema";
import type { RenewalStatus } from "@/lib/orders/queries";
import { effectiveTrackStatus, type TrackStatus } from "@/lib/renewals/status";
import type { Visible } from "@/lib/tenant/org-scope";

type OrderStatus = (typeof orders.status.enumValues)[number];

export type PlanFact = {
  id: bigint;
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
  /** Where the renewal stands: the best later plan by the same customer (`renewalStatusSql`). */
  renewal: RenewalStatus;
  /** The first booking among those later plans: when it renewed (`laterBookedAtFor`). */
  laterBookedAtFirst: number | null;
  /** The newest booking among those later plans (`laterBookedAtLatestFor`). */
  laterBookedAtLatest: number | null;
  /** The tracking inquiry's renewal fields (the lowest-id inquiry whose current order this is). */
  trackFollowUpAt: number | null;
  /** Staff or auto status after a later booking overrides it (`effectiveTrackStatus`). */
  track: TrackStatus | null;
};

// "Later" plan statuses: cancelled never counts (laterOrderWhere).
const LATER: ReadonlySet<OrderStatus> = new Set(["pending", "waitlisted", "active", "paused", "completed"]);
const RUNNING_OR_DONE: ReadonlySet<OrderStatus> = new Set(["active", "paused", "completed"]);

type Base = Omit<PlanFact, "renewal" | "laterBookedAtFirst" | "laterBookedAtLatest" | "track"> & {
  staff: TrackStatus | null;
  staffSetAt: number | null;
  staffSource: "staff" | "auto" | null;
};

/** Later plans: same customer, another plan, starts after this one and runs at least as long. A plan with no tiffins yet counts. */
function laterPlans(o: Base, byUser: Map<string, Base[]>): Base[] {
  if (o.userId == null) return [];
  const mine = o.last ?? "0001-01-01";
  return (byUser.get(String(o.userId)) ?? []).filter(
    (n) => n.id !== o.id && LATER.has(n.status) && n.startDate > o.startDate && (n.last ?? "9999-12-31") >= mine && (!o.trial || !n.trial),
  );
}

/** Running, finished or paid wins over unpaid, which wins over waitlisted. Trials only count later paid (non-trial) plans. */
export function renewalOf(later: readonly Pick<Base, "status" | "paid">[]): RenewalStatus {
  if (later.some((n) => RUNNING_OR_DONE.has(n.status) || n.paid)) return "renewed";
  if (later.some((n) => n.status === "pending")) return "unpaid";
  if (later.some((n) => n.status === "waitlisted")) return "waitlisted";
  return "none";
}

/** Facts for every plan. Later plans are looked up across organizations, as the SQL rule does. */
export async function loadPlanFacts(): Promise<PlanFact[]> {
  const [rows, lasts, paid, tracks] = await Promise.all([
    db
      .select({
        id: orders.id, userId: orders.userId, status: orders.status, startDate: orders.startDate, trialLength: orders.trialLength,
        createdAt: orders.createdAt, organizationId: orders.organizationId, currentOwner: orders.currentOwner,
        fullName: orders.fullName, deploymentId: orders.deploymentId, phone: users.phone,
      })
      .from(orders)
      .leftJoin(users, eq(orders.userId, users.id)),
    db
      .select({ orderId: deliveries.orderId, last: sql<string>`max(${deliveries.deliveryDate})` })
      .from(deliveries)
      .where(ne(deliveries.status, "cancelled"))
      .groupBy(deliveries.orderId),
    db.selectDistinct({ orderId: payments.orderId }).from(payments).where(inArray(payments.status, ["paid", "simulated_paid"])),
    db
      .select({
        orderId: inquiries.currentOrderId, id: inquiries.id, status: inquiries.renewalStatus, setAt: inquiries.renewalStatusSetAt,
        source: inquiries.renewalStatusSource, followUpAt: inquiries.renewalFollowUpAt,
      })
      .from(inquiries)
      .where(isNotNull(inquiries.currentOrderId)),
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
      id: o.id, userId: o.userId, status: o.status, startDate: o.startDate, trial: o.trialLength != null,
      createdAt: Number(o.createdAt), organizationId: o.organizationId, currentOwner: o.currentOwner,
      fullName: o.fullName, deploymentId: o.deploymentId, phone: o.phone,
      last: lastBy.get(k) ?? null, paid: paidBy.has(k),
      trackFollowUpAt: t?.followUpAt == null ? null : Number(t.followUpAt),
      staff: (t?.status as TrackStatus | null) ?? null, staffSetAt: t?.setAt == null ? null : Number(t.setAt), staffSource: t?.source ?? null,
    };
  });
  const byUser = new Map<string, Base[]>();
  for (const o of base) if (o.userId != null) (byUser.get(String(o.userId)) ?? byUser.set(String(o.userId), []).get(String(o.userId))!).push(o);

  return base.map(({ staff, staffSetAt, staffSource, ...o }) => {
    const later = laterPlans({ ...o, staff, staffSetAt, staffSource }, byUser);
    const renewal = renewalOf(later);
    const laterBookedAtFirst = later.length ? Math.min(...later.map((n) => n.createdAt)) : null;
    const laterBookedAtLatest = later.length ? Math.max(...later.map((n) => n.createdAt)) : null;
    const track = effectiveTrackStatus({ staff, staffSetAt, staffSource, computed: renewal, laterBookedAt: laterBookedAtLatest }).status;
    return { ...o, renewal, laterBookedAtFirst, laterBookedAtLatest, track };
  });
}

export const visibleTo = (visible: Visible) => (p: PlanFact) =>
  visible === "all" || (p.organizationId != null && visible.includes(p.organizationId));

/** A plan owner's internal id from their publicId, for owner filters over facts. */
export async function ownerIdOf(publicId: string): Promise<bigint | null> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return u?.id ?? null;
}
