import { Suspense } from "react";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { db } from "@/db/client";
import { couponRedemptions, coupons } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { epochBoundsWhere, withDefaultMonth } from "@/lib/list/default-month";
import { ALL_KINDS, KIND_LABELS } from "../kind-labels";
import { DiscountStats, DiscountStatsSkeleton, usd } from "../discount-stats";
import { KindsForm, KindsFormSkeleton } from "./form";

const SPEC: FacetDef[] = [
  { kind: "select", field: "status", label: "Status", options: [{ value: "on", label: "Enabled" }, { value: "off", label: "Disabled" }] },
  { kind: "search", fields: ["kind"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function KindsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-1 gap-6">
          <DiscountStatsSkeleton />
          <KindsFormSkeleton />
        </div>
      }
    >
      <KindsData searchParams={searchParams} />
    </Suspense>
  );
}

async function KindsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await withDefaultMonth(await searchParams);
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();

  const [policy, liveByKind, byKind] = await Promise.all([
    getDiscountPolicy(),
    db
      .select({ kind: coupons.kind, n: sql<number>`cast(count(*) as int)` })
      .from(coupons)
      .where(and(eq(coupons.active, true), or(isNull(coupons.expiresAt), gt(coupons.expiresAt, now))))
      .groupBy(coupons.kind),
    // Redemptions in the section date range, grouped by the coupon's kind.
    db
      .select({
        kind: coupons.kind,
        uses: sql<number>`cast(count(*) as int)`,
        discounted: sql<string>`coalesce(sum(${couponRedemptions.amountApplied}), 0)`,
      })
      .from(couponRedemptions)
      .innerJoin(coupons, eq(coupons.id, couponRedemptions.couponId))
      .where(epochBoundsWhere(couponRedemptions.createdAt, sp))
      .groupBy(coupons.kind)
      .orderBy(desc(sql`count(*)`)),
  ]);

  const top = byKind[0];
  const liveTotal = liveByKind.reduce((n, k) => n + k.n, 0);
  const stats = [
    { label: "Kinds enabled", value: `${policy.enabledKinds.length} of ${ALL_KINDS.length}` },
    { label: "Live coupons", value: liveTotal.toLocaleString(), hint: "Active and not expired" },
    { label: "Redemptions", value: byKind.reduce((n, k) => n + k.uses, 0).toLocaleString() },
    { label: "Total discounted", value: usd(byKind.reduce((n, k) => n + Number(k.discounted), 0)) },
    { label: "Top kind", value: top ? KIND_LABELS[top.kind] : "—", hint: top ? `${top.uses.toLocaleString()} uses` : "No uses in these dates" },
  ];

  const q = sp.q?.trim().toLowerCase() ?? "";
  const rows = ALL_KINDS.map((k) => {
    const used = byKind.find((r) => r.kind === k);
    return {
      kind: k,
      label: KIND_LABELS[k],
      live: liveByKind.find((r) => r.kind === k)?.n ?? 0,
      uses: used?.uses ?? 0,
      discounted: Number(used?.discounted ?? 0),
    };
  }).filter((r) =>
    (!sp.status || policy.enabledKinds.includes(r.kind) === (sp.status === "on")) &&
    (!q || r.label.toLowerCase().includes(q)),
  );
  const { page } = parseFilterState(SPEC, sp);

  return (
    <div className="grid grid-cols-1 gap-6">
      <DiscountStats items={stats} />
      <KindsForm policy={policy} rows={rows} spec={SPEC} pagination={page} />
    </div>
  );
}
