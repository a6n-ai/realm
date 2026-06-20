import { asc } from "drizzle-orm";
import { SettingsIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { SlotToggle } from "./slot-toggle";

export default async function MealSlotsSettingsPage() {
  await requireAdmin();

  const slots = await db
    .select()
    .from(mealSlots)
    .orderBy(asc(mealSlots.sortOrder));

  return (
    <PageShell>
      <PageHeader
        icon={SettingsIcon}
        title="Meal slots"
        subtitle="Enable the slots customers can order"
      />
      <SectionCard title="Slot configuration">
        <div className="space-y-4">
          {slots.map((slot) => (
            <SlotToggle key={slot.publicId} id={slot.publicId} label={slot.label} enabled={slot.enabled} />
          ))}
        </div>
      </SectionCard>
    </PageShell>
  );
}
