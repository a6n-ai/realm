import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { getMealTypes } from "@/lib/services/app-settings.service";
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";
import { SectionCard } from "@/components/ds";
import { MealTypesForm } from "../meal-types-form";

export default async function MealTypesPage() {
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

  return (
    <SectionCard
      title="Plan configuration"
      subtitle="Per-plan-type meal slots, accent colour, and menu title prefix."
    >
      <MealTypesForm initial={mealTypes} slots={allSlots} />
    </SectionCard>
  );
}
