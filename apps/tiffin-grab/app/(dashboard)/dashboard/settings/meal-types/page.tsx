import { Suspense } from "react";
import { UtensilsCrossedIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getMealTypes } from "@/lib/services/app-settings.service";
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

  // Slots are edited on the Categories tab of /dashboard/catalog/dishes, which
  // owns plan membership. This page keeps only the per-plan-type poster theme
  // (accent + title prefix), which nothing else edits.
  const mealTypes = await getMealTypes();

  return <MealTypesForm initial={mealTypes} />;
}
