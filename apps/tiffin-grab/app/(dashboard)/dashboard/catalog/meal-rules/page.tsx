import { Suspense } from "react";
import { ListChecksIcon } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSizes, plans } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { mealRulesService, type BuilderRule } from "@/lib/services/meal-rules.service";
import { generateDescription, type RuleLabels } from "@/lib/menu/meal-rule-text";
import { PageHeader, PageShell } from "@/components/ds";
import { RulesList, type ListRule } from "./rules-list";
import { ANY, type Draft } from "./rule-builder";

export default function MealRulesPage() {
  return (
    <Suspense fallback={<PageShell><PageHeader icon={ListChecksIcon} title="Meal Rules" /></PageShell>}>
      <MealRulesData />
    </Suspense>
  );
}

/** Round-trips a stored rule back into the builder's draft shape. */
function toDraft(r: BuilderRule): Draft {
  return {
    publicId: r.publicId,
    name: r.name ?? "",
    description: r.description ?? "",
    scopePlanPublicId: r.scopePlanPublicId ?? ANY,
    scopeMealSizePublicId: r.scopeMealSizePublicId ?? ANY,
    matchMode: r.matchMode,
    action: r.action,
    actionValue: String(r.actionValue ?? 1),
    enabled: r.enabled,
    conditions: r.conditions.map((c) => ({
      field: c.field,
      operator: c.operator,
      valuePublicIds: c.values.map((v) => v.publicId).filter(Boolean),
      valueKeys: c.valueKeys,
      valueText: c.valueText ?? "",
    })),
  };
}

function scopeLabel(r: BuilderRule): string {
  const parts = [r.scopePlanName ?? "Any plan", r.scopeMealSizeName ?? "Any meal size"];
  return parts.join(" · ");
}

async function MealRulesData() {
  await requireAdmin();

  const [rules, categories, planRows, dishRows, sizeRows] = await Promise.all([
    mealRulesService.listBuilderRules(),
    dishCategoriesService.enabledCategories(),
    db.select({ publicId: plans.publicId, name: plans.name }).from(plans).where(eq(plans.active, true)).orderBy(asc(plans.name)),
    db.select({ publicId: dishes.publicId, name: dishes.name }).from(dishes).orderBy(asc(dishes.name)),
    db.select({ publicId: mealSizes.publicId, name: mealSizes.name }).from(mealSizes).orderBy(asc(mealSizes.name)),
  ]);

  // Same generator the customer sees, so an admin previews the real sentence
  // rather than a second description that could drift from it.
  const labels: RuleLabels = {
    category: Object.fromEntries(categories.map((c) => [c.key, c.label])),
    plan: {},
    dish: {},
  };

  const listRules: ListRule[] = rules.map((r) => ({
    publicId: r.publicId,
    name: r.name,
    sentence: r.description?.trim()
      ? r.description.trim()
      : generateDescription(
          {
            publicId: r.publicId,
            matchMode: r.matchMode,
            action: r.action,
            actionValue: r.actionValue,
            priority: 0,
            conditions: r.conditions.map((c) => ({
              field: c.field,
              operator: c.operator,
              valueKeys: c.valueKeys,
              valueText: c.valueText,
              displayValues: c.values.map((v) => v.label),
            })),
          },
          labels,
        ),
    scopeLabel: scopeLabel(r),
    enabled: r.enabled,
    draft: toDraft(r),
  }));

  return (
    <PageShell>
      <PageHeader
        icon={ListChecksIcon}
        title="Meal Rules"
        subtitle="Additional limits that apply to the final meal, beyond meal size composition and swap limits."
      />
      <RulesList
        rules={listRules}
        dishes={dishRows.map((d) => ({ publicId: d.publicId, label: d.name }))}
        diets={planRows.map((p) => ({ publicId: p.publicId, label: p.name }))}
        categories={categories.map((c) => ({ key: c.key, label: c.label }))}
        mealSizes={sizeRows.map((m) => ({ publicId: m.publicId, label: m.name }))}
        plans={planRows.map((p) => ({ publicId: p.publicId, label: p.name }))}
      />
    </PageShell>
  );
}
