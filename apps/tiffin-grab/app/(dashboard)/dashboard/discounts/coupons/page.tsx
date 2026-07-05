import { Suspense } from "react";
import { asc, desc, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort, type SortState } from "@/lib/list/sort";
import { CouponsManager, CouponsManagerSkeleton } from "./coupons-manager";

// Server-sortable columns → their Drizzle expression. "value" (computed across
// kinds) and the action cell are intentionally absent.
const SORT_COL = {
  code: coupons.code,
  kind: coupons.kind,
  autoApply: coupons.autoApply,
  window: coupons.startsAt,
  stackable: coupons.stackable,
  status: coupons.active,
} as const;

type CouponSortColumn = keyof typeof SORT_COL;

type SearchParams = Promise<{ sort?: string; dir?: string }>;

export default function CouponsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<CouponsManagerSkeleton />}>
      <CouponsData searchParams={searchParams} />
    </Suspense>
  );
}

async function CouponsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const sort: SortState<CouponSortColumn> = parseSort(
    await searchParams,
    ["code", "kind", "autoApply", "window", "stackable", "status"],
    { column: "window", dir: "desc" },
  );

  const col = SORT_COL[sort.column];
  const primary = sort.dir === "asc" ? asc(col) : desc(col);

  // Project to public_id + display fields only — no bigint ids reach the client.
  // rep_daily coupons are minted by the scheduler, never hand-managed here.
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
      planTypes: coupons.planTypes,
      startsAt: coupons.startsAt,
      expiresAt: coupons.expiresAt,
      active: coupons.active,
      config: coupons.config,
    })
    .from(coupons)
    .where(ne(coupons.kind, "rep_daily"))
    .orderBy(primary, desc(coupons.createdAt));

  return <CouponsManager coupons={couponRows} sort={sort} />;
}

export type { CouponSortColumn };
