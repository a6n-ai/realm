import { db } from "@/db/client";
import { dishes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { DishesEditor } from "./dishes-editor";

export default async function DishesPage() {
  await requireAdmin();
  const rows = await db.select().from(dishes);
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Dishes</h1>
      <DishesEditor dishes={rows} />
    </section>
  );
}
