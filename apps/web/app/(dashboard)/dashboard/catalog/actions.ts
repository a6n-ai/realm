"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  deliveryFrequencyService,
  deliveryZoneService,
  durationPackageService,
  mealSizeService,
  planService,
} from "@/lib/services/catalog.service";
import { leadSourceService, leadSubsourceService } from "@/lib/services/lead-sources.service";

const SERVICES = {
  plans: planService,
  "meal-sizes": mealSizeService,
  "delivery-frequencies": deliveryFrequencyService,
  "duration-packages": durationPackageService,
  "delivery-zones": deliveryZoneService,
  "lead-sources": leadSourceService,
  "lead-subsources": leadSubsourceService,
} as const;

export type ResourceKey = keyof typeof SERVICES;

export async function saveItem(resource: ResourceKey, id: string | null, patch: Record<string, unknown>) {
  await requireAdmin();
  const svc = SERVICES[resource];
  if (id) await svc.update(id, patch);
  else await svc.create(patch);
  revalidatePath(`/dashboard/catalog/${resource}`);
}

export async function retireItem(resource: ResourceKey, id: string) {
  await requireAdmin();
  await SERVICES[resource].delete(id);
  revalidatePath(`/dashboard/catalog/${resource}`);
}

export async function reactivateItem(resource: ResourceKey, id: string) {
  await requireAdmin();
  await SERVICES[resource].update(id, { active: true });
  revalidatePath(`/dashboard/catalog/${resource}`);
}
