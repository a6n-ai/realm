import { Suspense } from "react";
import { requireAccountUser } from "@/app/(dashboard)/dashboard/account/current-user";
import { DietarySection } from "@/components/account/sections/dietary-section";
import { DietarySectionSkeleton } from "@/app/(dashboard)/dashboard/account/dietary/dietary-section-skeleton";

function splitAllergens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function MeDietaryPage() {
  return (
    <Suspense fallback={<DietarySectionSkeleton />}>
      <DietaryData />
    </Suspense>
  );
}

async function DietaryData() {
  const { user } = await requireAccountUser();
  return (
    <DietarySection
      dietaryNotes={user.dietaryNotes ?? ""}
      allergens={splitAllergens(user.allergens)}
    />
  );
}
