import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { ArrowLeftRightIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { categorySwapRules, mealSizes } from "@/db/schema";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { PageHeader, PageShell } from "@/components/ds";
import { SwapRuleGrid, type SwapRuleRow } from "./swap-rule-grid";

export default function CategorySwapsPage() {
  return (
    <Suspense fallback={<PageShell><PageHeader icon={ArrowLeftRightIcon} title="Category swaps" /></PageShell>}>
      <CategorySwapsData />
    </Suspense>
  );
}

async function CategorySwapsData() {
  await requireAdmin();

  const [sizes, rules, categories] = await Promise.all([
    db.select({ id: mealSizes.id, publicId: mealSizes.publicId, name: mealSizes.name })
      .from(mealSizes).where(eq(mealSizes.active, true)).orderBy(asc(mealSizes.name)),
    db.select({
      publicId: categorySwapRules.publicId,
      mealSizeId: categorySwapRules.mealSizeId,
      fromCategory: categorySwapRules.fromCategory,
      toCategory: categorySwapRules.toCategory,
      qtyFrom: categorySwapRules.qtyFrom,
      qtyTo: categorySwapRules.qtyTo,
      toWeightValue: categorySwapRules.toWeightValue,
      toWeightUnit: categorySwapRules.toWeightUnit,
    }).from(categorySwapRules),
    dishCategoriesService.enabledCategories(),
  ]);

  const labelByKey = new Map(categories.map((c) => [c.key, c.label]));
  const categoryOptions = categories.map((c) => ({ key: c.key, label: c.label }));

  return (
    <PageShell>
      <PageHeader
        icon={ArrowLeftRightIcon}
        title="Category swaps"
        subtitle="Which meal-size categories customers may swap between for a specific delivery day, and at what quantities."
      />
      <div className="grid gap-4">
        {sizes.map((size) => {
          const sizeRules: SwapRuleRow[] = rules
            .filter((r) => r.mealSizeId === size.id)
            .map((r) => ({
              id: r.publicId,
              fromCategory: r.fromCategory,
              fromLabel: labelByKey.get(r.fromCategory) ?? r.fromCategory,
              toCategory: r.toCategory,
              toLabel: labelByKey.get(r.toCategory) ?? r.toCategory,
              qtyFrom: r.qtyFrom,
              qtyTo: r.qtyTo,
              toWeightValue: r.toWeightValue == null ? null : Number(r.toWeightValue),
              toWeightUnit: r.toWeightUnit,
            }));
          return (
            <SwapRuleGrid
              key={size.publicId}
              mealSizePublicId={size.publicId}
              mealSizeName={size.name}
              categoryOptions={categoryOptions}
              rules={sizeRules}
            />
          );
        })}
      </div>
    </PageShell>
  );
}
