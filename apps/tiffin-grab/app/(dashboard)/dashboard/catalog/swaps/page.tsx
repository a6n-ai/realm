import { Suspense } from "react";
import { ArrowLeftRightIcon } from "lucide-react";
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

  const [pairs, categories] = await Promise.all([
    dishCategoriesService.listSwapPairs(),
    dishCategoriesService.enabledCategories(),
  ]);

  const categoryOptions = categories.map((c) => ({ key: c.key, label: c.label }));
  const categoryTu: AdminTuCategory[] = categories.map((c) => ({
    key: c.key,
    label: c.label,
    tuUnitType: c.tuUnitType,
    tuUnitSize: Number(c.tuUnitSize),
    tuUnitLabel: c.tuUnitLabel,
  }));
  const rows: SwapPairRow[] = pairs.map((p) => ({
    id: p.id,
    fromCategory: p.fromKey,
    fromLabel: p.fromLabel,
    toCategory: p.toKey,
    toLabel: p.toLabel,
  }));

  return (
    <PageShell>
      <PageHeader
        icon={ArrowLeftRightIcon}
        title="Swap Rules"
        subtitle="Which categories customers may exchange. Whether a swap actually runs on a given plan depends on that plan having a dish in the target category. Exchange is always 1 TU for 1 TU."
      />
      <SwapPairGrid
        categoryOptions={categoryOptions}
        categoryTu={categoryTu}
        pairs={rows}
      />
    </PageShell>
  );
}
