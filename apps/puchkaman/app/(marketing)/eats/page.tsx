import type { FileDetail } from "@realm/storage/model";
import { isPublicOrderingEnabled } from "@/lib/clover/public-ordering";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/menu-categories";
import { ordersService } from "@/lib/services/orders.service";
import { productsService } from "@/lib/services/products.service";
import { EatsView, type EatsCategory } from "./eats-view";

// ISR instead of force-dynamic — cached response for most visitors, still picks
// up admin/sync catalog changes (and Clover connect/disconnect) within a minute.
export const revalidate = 60;

async function getEats(): Promise<{
  categories: EatsCategory[];
  totalProducts: number;
  orderingEnabled: boolean;
}> {
  const [rows, orderable, orderingEnabled] = await Promise.all([
    productsService.listForPublicMenu(),
    ordersService.listOrderableCatalog(),
    isPublicOrderingEnabled(),
  ]);
  const orderableIds = new Set(orderable.map((o) => o.publicId));

  const byCategory = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }

  const known = CATEGORY_IDS.filter((id) => byCategory.has(id));
  // Catch any products whose category is not in the fixed list so they still appear.
  const extras = [...byCategory.keys()].filter((id) => !CATEGORY_IDS.includes(id as CategoryId));

  const categories: EatsCategory[] = [
    ...known.map((id: CategoryId) => ({
      id,
      ...CATEGORIES[id],
      items: (byCategory.get(id) ?? []).map((row) => ({
        publicId: row.publicId,
        name: row.name,
        description: row.description,
        price: Number(row.price),
        image: (row.image as FileDetail | null) ?? null,
        tags: row.tags ?? [],
        orderable: orderingEnabled && orderableIds.has(row.publicId),
        category: row.category,
        cloverColorCode: row.cloverColorCode ?? null,
      })),
    })),
    ...extras.map((id) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      emoji: "🍽️",
      note: "More from the kitchen.",
      items: (byCategory.get(id) ?? []).map((row) => ({
        publicId: row.publicId,
        name: row.name,
        description: row.description,
        price: Number(row.price),
        image: (row.image as FileDetail | null) ?? null,
        tags: row.tags ?? [],
        orderable: orderingEnabled && orderableIds.has(row.publicId),
        category: row.category,
        cloverColorCode: row.cloverColorCode ?? null,
      })),
    })),
  ];

  return { categories, totalProducts: rows.length, orderingEnabled };
}

export default async function EatsPage() {
  const { categories, totalProducts, orderingEnabled } = await getEats();
  return (
    <EatsView
      categories={categories}
      totalProducts={totalProducts}
      orderingEnabled={orderingEnabled}
    />
  );
}
