import { DietarySection } from "@/components/account/sections/dietary-section";
import { requireSectionAccess } from "../current-user";

function splitAllergens(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function AccountDietaryPage() {
  const { user } = await requireSectionAccess("dietary");
  return (
    <DietarySection
      dietaryNotes={user.dietaryNotes ?? ""}
      allergens={splitAllergens(user.allergens)}
    />
  );
}
