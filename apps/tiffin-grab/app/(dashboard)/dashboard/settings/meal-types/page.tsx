import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { UtensilsCrossedIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getMealTypes } from "@/lib/services/app-settings.service";
import { db } from "@/db/client";
import { dishCategories } from "@/db/schema";
import { PageHeader, SectionCard } from "@/components/ds";
import { MealTypesForm, MealTypesFormSkeleton } from "../meal-types-form";

export default function MealTypesPage() {
  return (
    <div className="grid gap-6">
      <PageHeader icon={UtensilsCrossedIcon} title="Meal types" />
      <SectionCard
        title="Dish Categories"
        subtitle="Per-plan-type dish categories, accent colour, and menu title prefix."
      >
        <Suspense fallback={<MealTypesFormSkeleton />}>
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
        id: dishCategories.publicId,
        planType: dishCategories.planType,
        key: dishCategories.key,
        label: dishCategories.label,
        enabled: dishCategories.enabled,
        selectable: dishCategories.selectable,
        sortOrder: dishCategories.sortOrder,
      })
      .from(dishCategories)
      .orderBy(asc(dishCategories.sortOrder)),
  ]);

  return <MealTypesForm initial={mealTypes} slots={allSlots} />;
}
