import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { KindsForm, KindsFormSkeleton } from "./form";

export default function KindsPage() {
  return (
    <Suspense fallback={<KindsFormSkeleton />}>
      <KindsData />
    </Suspense>
  );
}

async function KindsData() {
  await requireAdmin();
  const policy = await getDiscountPolicy();
  return <KindsForm policy={policy} />;
}
