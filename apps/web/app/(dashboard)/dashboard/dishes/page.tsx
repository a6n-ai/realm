import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { DishesEditor } from "./dishes-editor";

export default async function DishesPage() {
  await requireAdmin();
  const rows = await db
    .select({
      id: dishes.publicId,
      name: dishes.name,
      description: dishes.description,
      diet: dishes.diet,
      slots: dishes.slots,
      imageUrl: dishes.imageUrl,
      active: dishes.active,
    })
    .from(dishes)
    .orderBy(asc(dishes.name));
  return (
    <section className="space-y-6">
      <h1 className="gradient-text text-2xl font-semibold">Dishes</h1>
      <DishesEditor dishes={rows} />
    </section>
  );
}
