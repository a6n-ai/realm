"use server";

import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { selectablePlans } from "@/components/wizard/plan-filter";

export type CatalogSearchResults = {
  plans: { key: string; name: string }[];
  meals: { name: string; planKey: string }[];
};

const LIMIT = 6;

export async function searchCatalog(query: string): Promise<CatalogSearchResults> {
  const q = query.trim().toLowerCase();
  if (!q) return { plans: [], meals: [] };

  const catalog = toClientCatalog(await loadCatalogSnapshot());

  const plans = selectablePlans(catalog)
    .filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
    .slice(0, LIMIT)
    .map((p) => ({ key: p.key, name: p.name }));

  const meals = catalog.mealSizes
    .filter((m) => m.name.toLowerCase().includes(q) || m.items.some((i) => i.name.toLowerCase().includes(q)))
    .slice(0, LIMIT)
    .map((m) => ({ name: m.name, planKey: m.planKey }));

  return { plans, meals };
}
