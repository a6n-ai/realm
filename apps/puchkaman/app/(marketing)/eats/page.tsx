import type { Metadata } from "next";
import type { FileDetail } from "@realm/storage/model";
import { isPublicOrderingEnabled } from "@/lib/clover/public-ordering";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/lib/menu-categories";
import { groupByCloverSections } from "@/lib/products/public-menu";
import { inventoryCatalogService } from "@/lib/services/inventory.service";
import { ordersService } from "@/lib/services/orders.service";
import { productsService } from "@/lib/services/products.service";
import { buildMetadata, breadcrumbJsonLd } from "@/lib/seo";
import { EatsView, type EatsCategory } from "./eats-view";

// Tried ISR (`revalidate = 60`) for a caching win, but the CI Docker build has
// no real DB at build time and Next tries to prerender ISR/static pages during
// `next build`, which crashed the build. Reverted to force-dynamic until the
// build pipeline has a real build-time Postgres.
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Menu — Puchka, Chaat & Indian Street Food | Puchkaman Scarborough",
  description:
    "Full Puchkaman menu: aloo & dahi puchka, fusion puchkas, chaat, kathi rolls, vada pav, pav bhaji & summer drinks. Order pickup or delivery in Scarborough.",
  path: "/eats",
});

const breadcrumb = breadcrumbJsonLd([
  { name: "Home", path: "/" },
  { name: "Menu", path: "/eats" },
]);

function menuJsonLd(categories: EatsCategory[]) {
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  if (!nonEmpty.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: "Puchkaman Menu",
    hasMenuSection: nonEmpty.map((cat) => ({
      "@type": "MenuSection",
      name: cat.name,
      hasMenuItem: cat.items.map((item) => ({
        "@type": "MenuItem",
        name: item.name,
        description: item.description ?? undefined,
        offers: {
          "@type": "Offer",
          price: item.price.toFixed(2),
          priceCurrency: "CAD",
        },
      })),
    })),
  };
}

async function getEats(): Promise<{
  categories: EatsCategory[];
  totalProducts: number;
  orderingEnabled: boolean;
}> {
  const [rows, orderable, orderingEnabled, cloverSections] = await Promise.all([
    productsService.listForPublicMenu(),
    ordersService.listOrderableCatalog(),
    isPublicOrderingEnabled(),
    inventoryCatalogService.publicMenuSections(),
  ]);
  const orderableIds = new Set(orderable.map((o) => o.publicId));

  const toItem = (row: (typeof rows)[number]) => ({
    publicId: row.publicId,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    image: (row.image as FileDetail | null) ?? null,
    tags: row.tags ?? [],
    orderable: orderingEnabled && orderableIds.has(row.publicId),
    category: row.category,
    cloverColorCode: row.cloverColorCode ?? null,
  });

  // Clover is the inventory source of truth, so when its catalog has been
  // synced it also decides the menu's sections and their order. Before the
  // first sync there is nothing to group by, and the local category enum below
  // still drives the page.
  if (cloverSections.length) {
    const grouped = groupByCloverSections(rows, cloverSections);
    const categories: EatsCategory[] = grouped.sections.map((section) => ({
      ...section,
      items: section.items.map(toItem),
    }));
    if (grouped.unplaced.length) {
      categories.push({
        id: "uncategorised",
        name: "More from the kitchen",
        emoji: "🍽️",
        note: "",
        items: grouped.unplaced.map(toItem),
      });
    }
    return { categories, totalProducts: rows.length, orderingEnabled };
  }

  const byCategory = new Map<string, typeof rows>();
  for (const row of rows) {
    // Extras is a catch-all bucket for miscellaneous synced items — inactive
    // ones are dropped entirely here rather than shown greyed out, unlike
    // every other category (which keeps out-of-stock rows visible).
    if (row.category === "extra" && !row.active) continue;
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
  const menuJson = menuJsonLd(categories);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {menuJson && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(menuJson) }} />}
      <EatsView
        categories={categories}
        totalProducts={totalProducts}
        orderingEnabled={orderingEnabled}
      />
    </>
  );
}
