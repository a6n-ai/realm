import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { UtensilsCrossedIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getMealTypes } from "@/lib/services/app-settings.service";
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";
import { PageHeader, SectionCard } from "@/components/ds";
import { MealTypesForm } from "../meal-types-form";

export default function MealTypesPage() {
  return (
    <div className="grid gap-6">
      <PageHeader icon={UtensilsCrossedIcon} title="Meal types" />
      <SectionCard
        title="Plan configuration"
        subtitle="Per-plan-type meal slots, accent colour, and menu title prefix."
      >
        <Suspense fallback={<MealTypesForm.Skeleton />}>
          <MealTypesData />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function MealTypesData() {
  await requireAdmin();

  const [mealTypes, allSlots] = await Promise.all([
    getMealTypes(),
    db
      .select({
        id: mealSlots.publicId,
        planType: mealSlots.planType,
        key: mealSlots.key,
        label: mealSlots.label,
        enabled: mealSlots.enabled,
        sortOrder: mealSlots.sortOrder,
      })
      .from(mealSlots)
      .orderBy(asc(mealSlots.sortOrder)),
  ]);

  return <MealTypesForm initial={mealTypes} slots={allSlots} />;
}
