import { Suspense } from "react";
import { ArrowLeftRightIcon } from "lucide-react";
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

  const [pairs, categories] = await Promise.all([
    dishCategoriesService.listSwapPairs(),
    dishCategoriesService.enabledCategories(),
  ]);

  const categoryOptions = categories.map((c) => ({ key: c.key, label: c.label }));
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
        title="Category swaps"
        subtitle="Which categories customers may ever swap between, for any meal size that offers both. A swap is always 1 TU for 1 TU — the customer picks how many, per delivery day."
      />
      <SwapPairGrid categoryOptions={categoryOptions} pairs={rows} />
    </PageShell>
  );
}
