import { Suspense } from "react";
import { ArrowLeftRightIcon } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { PageHeader, PageShell } from "@/components/ds";
import { SwapPairGrid, type SwapPairRow } from "./swap-rule-grid";
import type { AdminTuCategory } from "../admin-tu-hints";

export default function SwapRulesPage() {
  return (
    <Suspense fallback={<PageShell><PageHeader icon={ArrowLeftRightIcon} title="Swap Rules" /></PageShell>}>
      <SwapRulesData />
    </Suspense>
  );
}

async function SwapRulesData() {
  await requireAdmin();

  const [pairs, categories, planRows, plansByCategoryKey, unreachableByKey] = await Promise.all([
    dishCategoriesService.listSwapPairs(),
    dishCategoriesService.enabledCategories(),
    db.select({ publicId: plans.publicId, name: plans.name, tagColor: plans.tagColor }).from(plans).where(eq(plans.active, true)),
    dishCategoriesService.plansByCategoryKey(),
    dishCategoriesService.unreachableByRestrictionByKey(),
  ]);

  const categoryOptions = categories.map((c) => ({ key: c.key, label: c.label }));
  const categoryTu: AdminTuCategory[] = categories.map((c) => ({
    key: c.key,
    label: c.label,
    tuUnitType: c.tuUnitType,
    tuUnitSize: Number(c.tuUnitSize),
    tuUnitLabel: c.tuUnitLabel,
  }));
  const planOptions = planRows.map((p) => ({ publicId: p.publicId, name: p.name, tagColor: p.tagColor }));
  const rows: SwapPairRow[] = pairs.map((p) => ({
    id: p.id,
    fromCategory: p.fromKey,
    fromLabel: p.fromLabel,
    toCategory: p.toKey,
    toLabel: p.toLabel,
    plans: p.plans.map((pl) => pl.publicId),
  }));
  const planIdsByCategory = Object.fromEntries(plansByCategoryKey);

  return (
    <PageShell>
      <PageHeader
        icon={ArrowLeftRightIcon}
        title="Swap Rules"
        subtitle="Which categories customers may exchange, and on which plans. Exchange is always 1 TU for 1 TU — natural amounts come from each category’s settings."
      />
      <SwapPairGrid
        categoryOptions={categoryOptions}
        categoryTu={categoryTu}
        planOptions={planOptions}
        planIdsByCategory={planIdsByCategory}
        unreachableByKey={unreachableByKey}
        pairs={rows}
      />
    </PageShell>
  );
}
