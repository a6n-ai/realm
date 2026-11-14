import { DAY_MS } from "@foundry/commons/util/dates";
import { couponStatus } from "@/lib/coupons/status";
import { Suspense } from "react";
import { and, asc, desc, eq, ilike, notInArray, or } from "drizzle-orm";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { db } from "@/db/client";
import { coupons, customerGroups } from "@/db/schema";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { findCustomerGroup } from "@/lib/customer-groups/customer-groups.service";
import { getPaymentConfig } from "@/lib/payments/payment-config";
import { parseSort, type SortState } from "@foundry/design-system/list-sort";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";
import { CREATABLE_KINDS, KIND_LABELS } from "@/lib/coupons/kind-labels";
import { CouponsManager, CouponsManagerSkeleton } from "./coupons-manager";
import { requestNow } from "@/lib/dates/request-now";

// Same Search + Filter bar as the other lists.
const SPEC: FacetDef[] = [
  { kind: "select", field: "kind", label: "Kind", options: CREATABLE_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] })) },
  { kind: "select", field: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "live", label: "Live" }, { value: "disabled", label: "Disabled" }] },
  { kind: "select", field: "auto", label: "Auto-apply", options: [{ value: "1", label: "Auto-apply" }] },
  { kind: "select", field: "expiring", label: "Expiring", options: [{ value: "1", label: "Within 7 days" }] },
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
      q ? or(ilike(coupons.code, `%${q}%`), ilike(coupons.name, `%${q}%`)) : undefined,
    ))
    .orderBy(primary, desc(coupons.createdAt));

  // Hand-made coupons are a small set: the cards count the date/kind set; status, auto-apply
  // and expiring narrow the table only, so a card still matches its own drill.
  const { page } = parseFilterState(SPEC, sp);
  const now = requestNow();
  const weekOut = now + 7 * DAY_MS;
  const isLive = (c: (typeof couponRows)[number]) => couponStatus(c, now) === "active";
  const isExpiring = (c: (typeof couponRows)[number]) => c.active && c.expiresAt != null && c.expiresAt > now && c.expiresAt <= weekOut;
  const live = couponRows.filter(isLive);
  const shown = couponRows.filter((c) => {
    if (sp.status === "active" && !c.active) return false;
    if (sp.status === "disabled" && c.active) return false;
    if (sp.status === "live" && !isLive(c)) return false;
    if (sp.auto === "1" && !c.autoApply) return false;
    if (sp.expiring === "1" && !isExpiring(c)) return false;
    return true;
  });
  const href = (over: { status?: string; auto?: string; expiring?: string } = {}) => {
    const qs = new URLSearchParams();
    if (sp.from) qs.set("from", sp.from);
    if (sp.to) qs.set("to", sp.to);
    if (kind) qs.set("kind", kind);
    if (q) qs.set("q", q);
    if (over.status) qs.set("status", over.status);
    if (over.auto) qs.set("auto", over.auto);
    if (over.expiring) qs.set("expiring", over.expiring);
    const s = qs.toString();
    return s ? `/dashboard/discounts/coupons?${s}` : "/dashboard/discounts/coupons";
  };
  const stats = [
    { label: "Coupons", value: couponRows.length.toLocaleString(), href: href() },
    { label: "Live", value: live.length.toLocaleString(), hint: "Active and not expired", href: href({ status: "live" }) },
    { label: "Auto-apply", value: live.filter((c) => c.autoApply).length.toLocaleString(), href: href({ status: "live", auto: "1" }) },
    { label: "Expiring in 7 days", value: live.filter(isExpiring).length.toLocaleString(), href: href({ expiring: "1" }) },
    { label: "Redemptions", value: couponRows.reduce((n, c) => n + c.redemptionCount, 0).toLocaleString() },
  ];
  const paymentMethods = (await getPaymentConfig()).methods.map((m) => ({ value: m.id, label: m.id === "stripe" ? "Card" : m.label }));
  const groupId = sp.newForGroup;
  const presetGroup = groupId ? await findCustomerGroup(groupId) : null;
  return (
    <>
      {groupId && !presetGroup && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>That customer group was not found. The new coupon is not restricted to a group.</AlertDescription>
        </Alert>
      )}
      <CouponsManager coupons={shown} paymentMethods={paymentMethods} stats={stats} sort={sort} pagination={page} spec={SPEC} presetGroup={presetGroup} />
    </>
  );
}

export type { CouponSortColumn };
