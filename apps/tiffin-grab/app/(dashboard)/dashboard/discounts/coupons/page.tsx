import { Suspense } from "react";
import { and, asc, desc, eq, ilike, notInArray, or } from "drizzle-orm";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { db } from "@/db/client";
import { coupons, customerGroups } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { parseSort, type SortState } from "@/lib/list/sort";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";
import { CREATABLE_KINDS, KIND_LABELS } from "../kind-labels";
import { CouponsManager, CouponsManagerSkeleton } from "./coupons-manager";

// Same Search + Filter bar as the other lists.
const SPEC: FacetDef[] = [
  { kind: "select", field: "kind", label: "Kind", options: CREATABLE_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })) },
  { kind: "select", field: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "disabled", label: "Disabled" }] },
  { kind: "search", fields: ["code", "name"] },
];

// Server-sortable columns → their Drizzle expression. "value" (computed across
// kinds) and the action cell are intentionally absent.
const SORT_COL = {
  code: coupons.code,
  kind: coupons.kind,
  autoApply: coupons.autoApply,
  visible: coupons.visible,
  window: coupons.startsAt,
  stackable: coupons.stackable,
  status: coupons.active,
} as const;

type CouponSortColumn = keyof typeof SORT_COL;

type SearchParams = Promise<Record<string, string | undefined>>;

export default function CouponsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<CouponsManagerSkeleton />}>
      <CouponsData searchParams={searchParams} />
    </Suspense>
  );
}

async function CouponsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const sp = await withDefaultMonth(await searchParams);
  const sort: SortState<CouponSortColumn> = parseSort(
    sp,
    ["code", "kind", "autoApply", "visible", "window", "stackable", "status"],
    { column: "window", dir: "desc" },
  );

  const kind = CREATABLE_KINDS.find((k) => k === sp.kind);
  const q = sp.q?.trim();
  const col = SORT_COL[sort.column];
  const primary = sort.dir === "asc" ? asc(col) : desc(col);

  // Project to public_id + display fields only — no bigint ids reach the client.
  // Rep coupons (daily and staff-issued codes) belong to the rep allowance, never hand-managed here.
  // createdAt desc is the stable tiebreaker under every sort.
  const couponRows = await db
    .select({
      publicId: coupons.publicId,
      code: coupons.code,
      kind: coupons.kind,
      name: coupons.name,
      description: coupons.description,
      valuePct: coupons.valuePct,
      valueAmount: coupons.valueAmount,
      minSubtotal: coupons.minSubtotal,
      maxRedemptions: coupons.maxRedemptions,
      maxPerUser: coupons.maxPerUser,
      redemptionCount: coupons.redemptionCount,
      stackable: coupons.stackable,
      autoApply: coupons.autoApply,
      visible: coupons.visible,
      planTypes: coupons.planTypes,
      allowedPaymentMethods: coupons.allowedPaymentMethods,
      startsAt: coupons.startsAt,
      expiresAt: coupons.expiresAt,
      active: coupons.active,
      config: coupons.config,
      customerGroupPublicId: customerGroups.publicId,
      groupName: customerGroups.name,
    })
    .from(coupons)
    .leftJoin(customerGroups, eq(customerGroups.id, coupons.customerGroupId))
    .where(and(
      notInArray(coupons.kind, ["rep_daily", "rep_code"]),
      epochBoundsWhere(coupons.createdAt, sp),
      kind ? eq(coupons.kind, kind) : undefined,
      sp.status === "active" || sp.status === "disabled" ? eq(coupons.active, sp.status === "active") : undefined,
      q ? or(ilike(coupons.code, `%${q}%`), ilike(coupons.name, `%${q}%`)) : undefined,
    ))
    .orderBy(primary, desc(coupons.createdAt));

  // Hand-made coupons are a small set: filtered in the query, paged client-side.
  const { page } = parseFilterState(SPEC, sp);
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();
  const weekOut = now + 7 * 86_400_000;
  const live = couponRows.filter((c) => c.active && (c.expiresAt == null || c.expiresAt > now));
  const stats = [
    { label: "Coupons", value: couponRows.length.toLocaleString() },
    { label: "Live", value: live.length.toLocaleString(), hint: "Active and not expired" },
    { label: "Auto-apply", value: live.filter((c) => c.autoApply).length.toLocaleString() },
    { label: "Expiring in 7 days", value: live.filter((c) => c.expiresAt != null && c.expiresAt <= weekOut).length.toLocaleString() },
    { label: "Redemptions", value: couponRows.reduce((n, c) => n + c.redemptionCount, 0).toLocaleString() },
  ];
  const paymentMethods = (await getPaymentConfig()).methods.map((m) => ({ value: m.id, label: m.id === "stripe" ? "Card (Stripe)" : m.label }));
  return <CouponsManager coupons={couponRows} paymentMethods={paymentMethods} stats={stats} sort={sort} pagination={page} spec={SPEC} />;
}

export type { CouponSortColumn };
