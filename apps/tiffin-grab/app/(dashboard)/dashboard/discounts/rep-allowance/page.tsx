import { Suspense } from "react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { db } from "@/db/client";
import { couponRedemptions, coupons, orders, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { RepAllowanceForm, RepAllowanceFormSkeleton, type IssuedCode } from "./form";

const customer = alias(users, "customer");

// Same Search + Filter bar as the other lists. The staff list is small and the allowed flag
// lives in the policy, not a column, so the page filters in memory.
const REP_SPEC: FacetDef[] = [
  { kind: "select", field: "role", label: "Role", options: [{ value: "admin", label: "Admin" }, { value: "member", label: "Member" }] },
  { kind: "select", field: "allowed", label: "Allowed", options: [{ value: "yes", label: "Allowed" }, { value: "no", label: "Switched off" }] },
  { kind: "search", fields: ["name", "email"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function RepAllowancePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<RepAllowanceFormSkeleton />}>
      <RepAllowanceData searchParams={searchParams} />
    </Suspense>
  );
}

async function RepAllowanceData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page } = parseFilterState(REP_SPEC, sp);

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
        publicId: coupons.publicId,
        active: coupons.active,
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
    publicId: c.publicId,
    code: c.code,
    amount: Number(c.amount ?? 0),
    note: c.note,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
    issuer: c.issuerName ?? c.issuerEmail ?? "Unknown",
    status: c.orderPublicId ? "used" : !c.active ? "revoked" : c.expiresAt != null && c.expiresAt < now ? "expired" : "unused",
    customer: c.customerName ?? c.customerEmail,
    orderPublicId: c.orderPublicId,
    applied: c.applied == null ? null : Number(c.applied),
  }));

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shownReps = reps.filter((r) =>
    (!sp.role || r.role === sp.role) &&
    (!sp.allowed || (policy.repDaily.perRep[r.publicId]?.active !== false) === (sp.allowed === "yes")) &&
    (!q || [r.name, r.email].some((v) => v?.toLowerCase().includes(q))),
  );

  return <RepAllowanceForm reps={shownReps} policy={policy} codes={codes} pagination={page} repSpec={REP_SPEC} />;
}
