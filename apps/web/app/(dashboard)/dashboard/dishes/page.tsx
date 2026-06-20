import { asc } from "drizzle-orm";
import { SaladIcon } from "lucide-react";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
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
    <PageShell>
      <PageHeader icon={SaladIcon} title="Dishes" />
      <SectionCard title="Manage dishes">
        <DishesEditor dishes={rows} />
      </SectionCard>
    </PageShell>
  );
}
