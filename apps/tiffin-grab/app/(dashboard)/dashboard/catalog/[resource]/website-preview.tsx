"use client";

import type { ReactNode } from "react";
import { EyeOffIcon } from "lucide-react";
import { MealCard } from "@/components/marketing/meal-card";

/**
 * Live mirror of how a row renders on the customer site. Reuses the real
 * marketing components (MealCard) and replicates the exact /pricing markup so
 * the preview can't drift from production. Resources with no public surface say
 * so honestly instead of inventing a fake look.
 */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function optMacro(v: unknown): number | null {
  return v === "" || v == null ? null : num(v);
}

const INTERNAL_PREVIEW: Record<string, string> = {
  addons: "Not shown on the public site yet. Offered as an order add-on.",
};

const PREVIEWS: Record<string, (values: Record<string, unknown>) => ReactNode> = {
  "meal-sizes": (values) => (
    <div className="max-w-xs">
      <MealCard
        meal={{
          id: 0n,
          publicId: "preview",
          key: String(values.key ?? ""),
          name: String(values.name || "Meal name"),
          description: values.description ? String(values.description) : null,
          planId: 0n,
          planKey: String(values.planId ?? ""),
          tier: (values.tier as "budget" | "medium" | "premium") || "budget",
          // components is derived from the composition rows, not hand-edited.
          components: ((values.items as { name?: string }[]) ?? []).map((i) => i?.name ?? "").filter(Boolean),
          items: [],
          kcalMin: num(values.kcalMin),
          kcalMax: num(values.kcalMax),
          proteinG: optMacro(values.proteinG),
          carbsG: optMacro(values.carbsG),
          fatG: optMacro(values.fatG),
          basePrice: num(values.basePrice),
          // Preview shows list price; meal-size discounts live in the central Discounts table.
          discountType: "none",
          discountValue: 0,
          trial: Boolean(values.trial),
          custom: false,
          priceable: true,
          servesWeekends: true,
        }}
      />
    </div>
  ),
  // Mirrors the "Nutrition baselines" card on /pricing.
  plans: (values) => (
    <div className="max-w-xs rounded-lg border p-5">
      <h3 className="font-medium">{String(values.name || "Plan name")}</h3>
      {values.description ? <p className="text-muted-foreground mt-1 text-sm">{String(values.description)}</p> : null}
    </div>
  ),
  // Mirrors the "Frequencies" list on /pricing.
  "delivery-frequencies": (values) => (
    <ul className="text-muted-foreground max-w-xs space-y-1 text-sm">
      <li className="flex justify-between"><span>{String(values.name || "Frequency")}</span></li>
    </ul>
  ),
  // Mirrors the "Commitment" list on /pricing.
  "duration-packages": (values) => {
    const w = num(values.weeks);
    return (
      <ul className="text-muted-foreground max-w-xs space-y-1 text-sm">
        <li className="flex justify-between"><span>{w || "—"} week{w === 1 ? "" : "s"}</span></li>
      </ul>
    );
  },
};

export function WebsitePreview({ resource, values }: { resource: string; values: Record<string, unknown> }) {
  const body = PREVIEWS[resource]?.(values) ?? (
    <p className="text-muted-foreground flex items-start gap-2 text-sm">
      <EyeOffIcon className="mt-0.5 size-4 shrink-0" />
      {INTERNAL_PREVIEW[resource] ?? "Not shown on the public site."}
    </p>
  );

  return (
    <div className="border-border/70 bg-muted/30 sm:col-span-2 -mx-5 -mb-5 mt-1 border-t px-5 py-4">
      <p className="text-muted-foreground/80 text-[0.7rem] font-semibold tracking-[0.08em] uppercase">
        Website preview
      </p>
      <div className="mt-3">{body}</div>
    </div>
  );
}
