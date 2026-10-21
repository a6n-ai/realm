import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { RepAllowanceForm, RepAllowanceFormSkeleton } from "./form";

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
  const [reps, policy] = await Promise.all([
    db
      .select({ publicId: users.publicId, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(and(inArray(users.role, ["admin", "member"]), eq(users.isSystem, false)))
      .orderBy(users.name),
    getDiscountPolicy(),
  ]);

  const rd = policy.repDaily;
  const allowed = reps.filter((r) => rd.perRep[r.publicId]?.active !== false).length;
  const stats = [
    { label: "Staff discounts", value: rd.enabled ? "On" : "Off" },
    { label: "Staff allowed", value: `${rd.enabled ? allowed : 0} of ${reps.length}` },
    { label: "Default ceiling", value: `${rd.defaultCapPct}% · $${rd.defaultCapAmount}`, hint: "Lower of the two applies" },
    { label: "Discounts per day", value: rd.defaultDailyUses.toLocaleString(), hint: "Per staff member" },
    { label: "Code validity", value: `${rd.codeValidityHours} h`, hint: "Estimate and Create coupon codes" },
  ];

  const q = sp.q?.trim().toLowerCase() ?? "";
  const shownReps = reps.filter((r) =>
    (!sp.role || r.role === sp.role) &&
    (!sp.allowed || (rd.perRep[r.publicId]?.active !== false) === (sp.allowed === "yes")) &&
    (!q || [r.name, r.email].some((v) => v?.toLowerCase().includes(q))),
  );

  return <RepAllowanceForm reps={shownReps} policy={policy} stats={stats} pagination={page} repSpec={REP_SPEC} />;
}
