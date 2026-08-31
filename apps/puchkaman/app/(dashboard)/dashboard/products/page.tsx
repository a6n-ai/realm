import { Suspense } from "react";
import { PackageIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard, parseFilterState, type FacetDef } from "@foundry/design-system";
import { getCloverConnection } from "@foundry/clover";
import { Skeleton } from "@foundry/ui/skeleton";
import { requirePermission } from "@/lib/auth/guards";
import { getSession, roleOrCustomer } from "@/lib/auth/session";
import { grantedKeys } from "@/lib/auth/nav-permissions";
import { parseSort } from "@/lib/list/sort";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { productsService, type ProductSortColumn } from "@/lib/services/products.service";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/menu-categories";
import { ProductsHeaderActions } from "./products-header-actions";
import { ProductsTable, ProductsTableSkeleton } from "./products-table";

const PRODUCT_SORT_COLUMNS = [
  "name",
  "category",
  "price",
  "status",
  "source",
  "lastSynced",
] as const satisfies readonly ProductSortColumn[];

type SearchParams = Promise<Record<string, string | undefined>>;

// Facet spec — server-authored so parseFilterState (server) and ReuiFacetFilters
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
    ],
  },
  {
    kind: "pills",
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
    <PageShell>
      <PageHeader
        icon={PackageIcon}
        title="Products"
        subtitle="Manage what shows on the public menu."
        actions={
          <Suspense fallback={<Skeleton className="h-9 w-40" />}>
            <ProductsHeaderLoader />
          </Suspense>
        }
      />
      <SectionCard title="All products">
        <Suspense fallback={<ProductsTableSkeleton />}>
          <ProductsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function ProductsHeaderLoader() {
  const [clover, session] = await Promise.all([
    getCloverConnection(integrationsConfigStore),
    getSession(),
  ]);
  return (
    <ProductsHeaderActions
      cloverEnabled={Boolean(clover.installed)}
      cloverConnected={Boolean(clover.connected && clover.merchantId)}
      granted={grantedKeys(roleOrCustomer(session?.user.role))}
    />
  );
}

async function ProductsData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ product: ["read"] });
  const session = await getSession();

  const sp = await searchParams;
  const sort = parseSort(sp, PRODUCT_SORT_COLUMNS, { column: "category", dir: "asc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const [result, clover] = await Promise.all([
    productsService.queryProducts(condition, page, sort),
    getCloverConnection(integrationsConfigStore),
  ]);
  const rows = result.items.map((r) => ({
    ...r,
    price: Number(r.price),
    cloverItemId: r.cloverItemId ?? null,
    cloverLastSyncedAt: r.cloverLastSyncedAt ?? null,
    cloverColorCode: r.cloverColorCode ?? null,
  }));

  return (
    <ProductsTable
      spec={SPEC}
      products={rows}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
      cloverEnabled={Boolean(clover.installed)}
      cloverConnected={Boolean(clover.connected && clover.merchantId)}
      granted={grantedKeys(roleOrCustomer(session?.user.role))}
    />
  );
}
