import { Suspense } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { couponRedemptions, coupons, orders, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { RepAllowanceForm, RepAllowanceFormSkeleton, type IssuedCode } from "./form";

const customer = alias(users, "customer");

export default function RepAllowancePage() {
  return (
    <Suspense fallback={<RepAllowanceFormSkeleton />}>
      <RepAllowanceData />
    </Suspense>
  );
}

async function RepAllowanceData() {
  await requireAdmin();

  // Project reps to public_id + display fields only — no bigint ids reach the client.
  const [reps, policy, issued] = await Promise.all([
    db
      .select({ publicId: users.publicId, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(and(inArray(users.role, ["admin", "member"]), eq(users.isSystem, false)))
      .orderBy(users.name),
    getDiscountPolicy(),
    // Who issued each code and who used it. ponytail: newest 100, paginate when staff issue more.
    db
      .select({
        code: coupons.code,
        amount: coupons.valueAmount,
        note: coupons.description,
        createdAt: coupons.createdAt,
        expiresAt: coupons.expiresAt,
        issuerName: users.name,
        issuerEmail: users.email,
        customerName: customer.name,
        customerEmail: customer.email,
        orderPublicId: orders.publicId,
        applied: couponRedemptions.amountApplied,
      })
      .from(coupons)
      .innerJoin(users, eq(users.id, coupons.ownerUserId))
      .leftJoin(couponRedemptions, eq(couponRedemptions.couponId, coupons.id))
      .leftJoin(customer, eq(customer.id, couponRedemptions.userId))
      .leftJoin(orders, eq(orders.id, couponRedemptions.orderId))
      .where(eq(coupons.kind, "rep_code"))
      .orderBy(desc(coupons.createdAt))
      .limit(100),
  ]);

  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();
  const codes: IssuedCode[] = issued.map((c) => ({
    code: c.code,
    amount: Number(c.amount ?? 0),
    note: c.note,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
    issuer: c.issuerName ?? c.issuerEmail ?? "Unknown",
    status: c.orderPublicId ? "used" : c.expiresAt != null && c.expiresAt < now ? "expired" : "unused",
    customer: c.customerName ?? c.customerEmail,
    orderPublicId: c.orderPublicId,
    applied: c.applied == null ? null : Number(c.applied),
  }));

  return <RepAllowanceForm reps={reps} policy={policy} codes={codes} />;
}
