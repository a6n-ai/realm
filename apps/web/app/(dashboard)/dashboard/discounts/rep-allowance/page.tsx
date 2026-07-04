import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { RepAllowanceForm } from "./form";

export default function RepAllowancePage() {
  return (
    <Suspense fallback={<RepAllowanceForm.Skeleton />}>
      <RepAllowanceData />
    </Suspense>
  );
}

async function RepAllowanceData() {
  await requireAdmin();

  // Project reps to public_id + display fields only — no bigint ids reach the client.
  const [reps, policy] = await Promise.all([
    db
      .select({ publicId: users.publicId, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.role, "member"), eq(users.isSystem, false)))
      .orderBy(users.name),
    getDiscountPolicy(),
  ]);

  return <RepAllowanceForm reps={reps} policy={policy} />;
}
