"use server";

import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { isUniqueViolation } from "@/lib/db/errors";
import { ConflictError } from "@/lib/errors";
import {
  addonService,
  deliveryFrequencyService,
  discountService,
  durationPackageService,
  mealSizeService,
  planService,
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
  discounts: discountService,
  addons: addonService,
} as const;

export type ResourceKey = keyof typeof SERVICES;

// Every resource here feeds loadCatalogSnapshot, so any edit busts the snapshot
// cache and regenerates the public marketing pages that read it.
const opts = (resource: ResourceKey) => ({ guard: "admin", revalidate: [`/dashboard/catalog/${resource}`], catalog: true }) as const;

export async function saveItem(resource: ResourceKey, id: string | null, patch: Record<string, unknown>): Promise<ActionResult> {
  return staffAction(opts(resource), async () => {
    const svc = SERVICES[resource];
    try {
      if (id) await svc.update(id, patch);
      else await svc.create(patch);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError("An item with this name already exists");
      throw e;
    }
  });
}

export async function retireItem(resource: ResourceKey, id: string): Promise<ActionResult> {
  return staffAction(opts(resource), async () => {
    await SERVICES[resource].delete(id);
  });
}

export async function reactivateItem(resource: ResourceKey, id: string): Promise<ActionResult> {
  return staffAction(opts(resource), async () => {
    await SERVICES[resource].update(id, { active: true });
  });
}
