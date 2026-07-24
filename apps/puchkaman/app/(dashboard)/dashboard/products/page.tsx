import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";
import { SkeletonRows } from "@/components/admin/skeleton-rows";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/menu-categories";
import { parseFilterState, type FacetDef } from "@realm/design-system";
import { ProductsTable } from "./products-table";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

// Facet spec — server-authored so parseFilterState (server) and FacetFilters
// (client) stay in lockstep. Fields match the products schema's camelCase
// property names (see db/schema/products.ts) since the service resolves them
// straight off that table.
const SPEC: FacetDef[] = [
  {
    kind: "select",
    field: "category",
    label: "Category",
    options: CATEGORY_IDS.map((id) => ({ value: id, label: CATEGORIES[id].name })),
  },
  {
    kind: "pills",
    field: "source",
    label: "Source",
    options: [
      { value: "manual", label: "Manual" },
      { value: "uber_eats", label: "Uber Eats" },
    ],
  },
  {
    kind: "pills",
    field: "syncStatus",
    label: "Sync status",
    options: [
      { value: "none", label: "None" },
      { value: "synced", label: "Synced" },
      { value: "update_available", label: "Update available" },
    ],
  },
  {
    kind: "select",
    field: "featured",
    label: "Featured",
    options: [
      { value: "true", label: "Featured" },
      { value: "false", label: "Not featured" },
    ],
  },
  { kind: "search", fields: ["name", "slug"] },
];

export default function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <p className="kicker" style={{ opacity: 0.55, marginBottom: 4 }}>
          Catalog
        </p>
        <h1 className="display" style={{ fontSize: "1.8rem" }}>
          Products
        </h1>
        <p style={{ opacity: 0.7, fontWeight: 500, marginTop: 4 }}>Manage what shows on the public menu.</p>
      </div>
      <Suspense fallback={<SkeletonRows />}>
        <ProductsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ProductsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();

  const sp = await searchParams;
  const { condition, page } = parseFilterState(SPEC, sp);

  const result = await productsService.queryProducts(condition, page);
  const rows = result.items.map((r) => ({ ...r, price: Number(r.price) }));

  return <ProductsTable spec={SPEC} products={rows} total={result.total} page={page.page} size={page.size} />;
}
