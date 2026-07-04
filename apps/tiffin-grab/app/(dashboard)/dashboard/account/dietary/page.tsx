import { Suspense } from "react";
import { DietarySection } from "@/components/account/sections/dietary-section";
import { DietarySectionSkeleton } from "./dietary-section-skeleton";
import { requireSectionAccess } from "../current-user";

function splitAllergens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function AccountDietaryPage() {
  return (
    <Suspense fallback={<DietarySectionSkeleton />}>
      <DietaryData />
    </Suspense>
  );
}

async function DietaryData() {
  const { user } = await requireSectionAccess("dietary");
  return (
    <DietarySection
      dietaryNotes={user.dietaryNotes ?? ""}
      allergens={splitAllergens(user.allergens)}
    />
  );
}
