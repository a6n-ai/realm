import { TicketPercentIcon } from "lucide-react";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { PageShell, PageHeader } from "@/components/ds";
import { DiscountsManager } from "./manager";

export default async function DiscountsSettingsPage() {
  await requireAdmin();

  const [couponRows, reps, policy] = await Promise.all([
    // Project to public_id + display fields only — no bigint ids reach the client.
    // rep_daily coupons are minted by the scheduler, never hand-managed here.
    db
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
      .orderBy(desc(coupons.createdAt)),
    db
      .select({ publicId: users.publicId, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.role, "member"), eq(users.isSystem, false)))
      .orderBy(users.name),
    getDiscountPolicy(),
  ]);

  return (
    <PageShell>
      <PageHeader
        icon={TicketPercentIcon}
        title="Discounts & Coupons"
        subtitle="Manage coupons and the sales-rep daily discount allowance."
      />
      <DiscountsManager coupons={couponRows} reps={reps} policy={policy} />
    </PageShell>
  );
}
