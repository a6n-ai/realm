import { Suspense } from "react";
import { UtensilsIcon } from "lucide-react";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { loadPricingRows } from "@/lib/services/custom-meal.service";
import { formatTuHuman } from "@/lib/menu/format-tu";
import { parseFilterState, type FacetDef } from "@foundry/design-system";
import { PageHeader, PageShell } from "@/components/ds";
import { PricingGrid, type PricingGridRow } from "./pricing-grid";
import { filterPricingRows, PRICING_STATUSES } from "./filter-rows";

type SearchParams = Record<string, string | undefined>;

export default function CustomMealsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<PageShell><PageHeader icon={UtensilsIcon} title="Custom Meals" /></PageShell>}>
      <CustomMealsData searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomMealsData({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;

  const [categories, planRows, pricing, plansByCategory] = await Promise.all([
    dishCategoriesService.enabledCategories(),
    db.select({ publicId: plans.publicId, key: plans.key, name: plans.name }).from(plans).where(eq(plans.active, true)),
    loadPricingRows(),
    dishCategoriesService.plansByCategoryKey(),
  ]);

  const priced = new Map(pricing.map((p) => [`${p.category}:${p.planKey}`, p]));
  const rows: PricingGridRow[] = categories.flatMap((cat) => {
    const unitHint = `1 TU = ${formatTuHuman({ ...cat, tuUnitSize: Number(cat.tuUnitSize) }, 1)}`;
    // Only the plans this category belongs to (Catalog → Dish categories).
    const linked = plansByCategory.get(cat.key) ?? [];
    return planRows.filter((plan) => linked.includes(plan.publicId)).map((plan) => {
      const p = priced.get(`${cat.key}:${plan.key}`);
      return {
        categoryKey: cat.key,
        categoryLabel: cat.label,
        unitHint,
        planKey: plan.key,
        planName: plan.name,
        pricePerTu: p?.pricePerTu ?? null,
        maxTu: p?.maxTu ?? null,
        active: p?.active ?? false,
      };
    });
  });

  const spec: FacetDef[] = [
    { kind: "search", fields: ["category"] },
    { kind: "multi", field: "diet", label: "Diet", options: planRows.map((p) => ({ value: p.key, label: p.name })) },
    { kind: "multi", field: "status", label: "Status", options: PRICING_STATUSES.map((st) => ({ ...st })) },
  ];
  const { page } = parseFilterState(spec, sp);
  const filtered = filterPricingRows(rows, sp);

  return (
    <PageShell>
      <PageHeader
        icon={UtensilsIcon}
        title="Custom Meals"
        subtitle="What customers pay per TU when they build their own meal, by category and diet."
      />
      <PricingGrid
        rows={filtered.slice(page.page * page.size, (page.page + 1) * page.size)}
        spec={spec}
        page={page.page}
        size={page.size}
        total={filtered.length}
      />
    </PageShell>
  );
}
