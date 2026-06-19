import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { mealSlots } from "@/db/schema";
import { SlotToggle } from "./slot-toggle";

export default async function MealSlotsSettingsPage() {
  await requireAdmin();

  const slots = await db
    .select()
    .from(mealSlots)
    .orderBy(asc(mealSlots.sortOrder));

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Meal Slots</h1>
      <p className="text-muted-foreground text-sm">Enable or disable meal slots offered in weekly menus.</p>
      <div className="space-y-4">
        {slots.map((slot) => (
          <SlotToggle key={slot.id} id={slot.id} label={slot.label} enabled={slot.enabled} />
        ))}
      </div>
    </section>
  );
}
