import type { FileDetail } from "@realm/storage/model";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/menu-categories";
import { productsService } from "@/lib/services/products.service";
import { EatsView, type EatsCategory } from "./eats-view";

export const dynamic = "force-dynamic";

async function getEats(): Promise<EatsCategory[]> {
  const rows = await productsService.listActive();
  const byCategory = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }
  return CATEGORY_IDS.filter((id) => byCategory.has(id)).map((id: CategoryId) => ({
    id,
    ...CATEGORIES[id],
    items: (byCategory.get(id) ?? []).map((row) => ({
      publicId: row.publicId,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      image: (row.image as FileDetail | null) ?? null,
      tags: row.tags ?? [],
    })),
  }));
}

export default async function EatsPage() {
  const categories = await getEats();
  return <EatsView categories={categories} />;
}
