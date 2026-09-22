import { Suspense } from "react";
import { ListChecksIcon } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { plans } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { mealRulesService } from "@/lib/services/meal-rules.service";
import { PageHeader, PageShell } from "@/components/ds";
import { MealRulesGrid } from "./meal-rules-grid";

export default function MealRulesPage() {
  return (
    <Suspense fallback={<PageShell><PageHeader icon={ListChecksIcon} title="Meal Rules" /></PageShell>}>
      <MealRulesData />
    </Suspense>
  );
}

async function MealRulesData() {
  await requireAdmin();

  const [rules, categories, planRows] = await Promise.all([
    mealRulesService.listAll(),
    dishCategoriesService.enabledCategories(),
    db.select({ publicId: plans.publicId, name: plans.name, tagColor: plans.tagColor }).from(plans).where(eq(plans.active, true)),
  ]);

  const categoryByKey = new Map(categories.map((c) => [c.key, c.label]));

  return (
    <PageShell>
      <PageHeader
        icon={ListChecksIcon}
        title="Meal Rules"
        subtitle="Additional limits that apply to the final meal, beyond meal size composition and swap limits."
      />
      <MealRulesGrid
        rules={rules.map((r) => ({
          id: r.publicId,
          planPublicId: r.planPublicId,
          planName: r.planName,
          categoryKey: r.categoryKey,
          categoryLabel: categoryByKey.get(r.categoryKey) ?? r.categoryKey,
          condition: r.condition,
          maxCount: r.maxCount,
          enabled: r.enabled,
        }))}
        planOptions={planRows.map((p) => ({ publicId: p.publicId, name: p.name, tagColor: p.tagColor }))}
        categoryOptions={categories.map((c) => ({ key: c.key, label: c.label }))}
      />
    </PageShell>
  );
}
