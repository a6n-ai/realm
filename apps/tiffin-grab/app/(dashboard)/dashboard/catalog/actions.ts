"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import {
  addonService,
  deliveryFrequencyService,
  deliveryZoneService,
  durationPackageService,
  mealSizeService,
  planService,
  pricingTierService,
} from "@/lib/services/catalog.service";
import { dishesService } from "@/lib/services/dishes.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
// NOTE: lead-source services were never catalog resources — drop them from this map;
// lead sources are managed on /dashboard/settings/lead-sources.

const SERVICES = {
  dishes: dishesService,
  "dish-categories": dishCategoriesService,
  plans: planService,
  "meal-sizes": mealSizeService,
  "delivery-frequencies": deliveryFrequencyService,
  "duration-packages": durationPackageService,
  "delivery-zones": deliveryZoneService,
  "pricing-tiers": pricingTierService,
  addons: addonService,
} as const;

export type ResourceKey = keyof typeof SERVICES;

// Every resource here feeds loadCatalogSnapshot, so any edit busts the snapshot
// cache and regenerates the public marketing pages that read it.
async function bustCatalog(resource: ResourceKey) {
  revalidatePath(`/dashboard/catalog/${resource}`);
  await invalidateCatalogSnapshot();
  revalidatePath("/menu");
  revalidatePath("/pricing");
}

export async function saveItem(resource: ResourceKey, id: string | null, patch: Record<string, unknown>) {
  await requireAdmin();
  const svc = SERVICES[resource];
  if (id) await svc.update(id, patch);
  else await svc.create(patch);
  await bustCatalog(resource);
}

export async function retireItem(resource: ResourceKey, id: string) {
  await requireAdmin();
  await SERVICES[resource].delete(id);
  await bustCatalog(resource);
}

export async function reactivateItem(resource: ResourceKey, id: string) {
  await requireAdmin();
  await SERVICES[resource].update(id, { active: true });
  await bustCatalog(resource);
}
