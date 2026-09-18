import { Suspense } from "react";
import { ArrowLeftRightIcon } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { PageHeader, PageShell } from "@/components/ds";
import { SwapPairGrid, type SwapPairRow } from "./swap-rule-grid";

export default function CategorySwapsPage() {
  return (
    <Suspense fallback={<PageShell><PageHeader icon={ArrowLeftRightIcon} title="Category swaps" /></PageShell>}>
      <CategorySwapsData />
    </Suspense>
  );
}

async function CategorySwapsData() {
  await requireAdmin();

  const [pairs, categories, planRows, plansByCategoryKey, unreachableByKey] = await Promise.all([
    dishCategoriesService.listSwapPairs(),
    dishCategoriesService.enabledCategories(),
    db.select({ publicId: plans.publicId, name: plans.name, tagColor: plans.tagColor }).from(plans).where(eq(plans.active, true)),
    dishCategoriesService.plansByCategoryKey(),
    dishCategoriesService.unreachableByRestrictionByKey(),
  ]);

  const categoryOptions = categories.map((c) => ({ key: c.key, label: c.label }));
  const planOptions = planRows.map((p) => ({ publicId: p.publicId, name: p.name, tagColor: p.tagColor }));
  const rows: SwapPairRow[] = pairs.map((p) => ({
    id: p.id,
    fromCategory: p.fromKey,
    fromLabel: p.fromLabel,
    toCategory: p.toKey,
    toLabel: p.toLabel,
    plans: p.plans.map((pl) => pl.publicId),
  }));
  // { categoryKey: [planPublicId, ...] } — lets the client narrow the plan picker
  // to only plans that actually have BOTH sides of a pair, instead of showing
  // every plan and leaving the admin to guess which ones are even relevant.
  const planIdsByCategory = Object.fromEntries(plansByCategoryKey);

  return (
    <PageShell>
      <PageHeader
        icon={ArrowLeftRightIcon}
        title="Category swaps"
        subtitle="Which categories customers may swap between, and on which plans. A swap is always 1 TU for 1 TU — the customer picks how many, per delivery day."
      />
      <SwapPairGrid
        categoryOptions={categoryOptions}
        planOptions={planOptions}
        planIdsByCategory={planIdsByCategory}
        unreachableByKey={unreachableByKey}
        pairs={rows}
      />
    </PageShell>
  );
}
