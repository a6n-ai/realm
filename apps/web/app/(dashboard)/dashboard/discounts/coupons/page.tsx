import { Suspense } from "react";
import { desc, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { CouponsManager } from "./coupons-manager";

export default function CouponsPage() {
  return (
    <Suspense fallback={<CouponsManager.Skeleton />}>
      <CouponsData />
    </Suspense>
  );
}

async function CouponsData() {
  await requireAdmin();

  // Project to public_id + display fields only — no bigint ids reach the client.
  // rep_daily coupons are minted by the scheduler, never hand-managed here.
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
    .orderBy(desc(coupons.createdAt));

  return <CouponsManager coupons={couponRows} />;
}
