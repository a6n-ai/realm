import { Suspense } from "react";
import { UtensilsIcon } from "lucide-react";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { loadPricingRows } from "@/lib/services/custom-meal.service";
import { formatTuHuman } from "@/lib/menu/format-tu";
import { PageHeader, PageShell } from "@/components/ds";
import { PricingGrid, type PricingGridRow } from "./pricing-grid";

export default function CustomMealsPage() {
  return (
    <Suspense fallback={<PageShell><PageHeader icon={UtensilsIcon} title="Custom Meals" /></PageShell>}>
      <CustomMealsData />
    </Suspense>
  );
}

async function CustomMealsData() {
  await requireAdmin();

  const [categories, planRows, pricing] = await Promise.all([
    dishCategoriesService.enabledCategories(),
    db.select({ key: plans.key, name: plans.name }).from(plans).where(eq(plans.active, true)),
    loadPricingRows(),
  ]);

  const priced = new Map(pricing.map((p) => [`${p.category}:${p.planKey}`, p]));
  const rows: PricingGridRow[] = categories.flatMap((cat) => {
    const unitHint = `1 TU = ${formatTuHuman({ ...cat, tuUnitSize: Number(cat.tuUnitSize) }, 1)}`;
    return planRows.map((plan) => {
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

  return (
    <PageShell>
      <PageHeader
        icon={UtensilsIcon}
        title="Custom Meals"
        subtitle="What customers pay per TU when they build their own meal, by category and diet."
      />
      <PricingGrid rows={rows} />
    </PageShell>
  );
}
