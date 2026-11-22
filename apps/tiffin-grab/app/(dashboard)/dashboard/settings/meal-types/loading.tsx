import { UtensilsCrossedIcon } from "lucide-react";
import { SectionCard } from "@/components/ds";
import { SettingsPageFrame } from "../_skeletons";
import { MealTypesFormSkeleton } from "../meal-types-form";

export default function Loading() {
  return (
    <SettingsPageFrame icon={UtensilsCrossedIcon} title="Meal types">
      <SectionCard title="Dish Categories" subtitle="Per-plan-type dish categories, accent colour, and menu title prefix.">
        <MealTypesFormSkeleton />
      </SectionCard>
    </SettingsPageFrame>
  );
}
