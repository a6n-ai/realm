"use server";

import { requireStaff } from "@/lib/auth/guards";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { orderFormCatalog } from "../orders/order-form-catalog";

// Loaded when the estimate opens: the Create coupon dialog sits on every dashboard page.
export async function estimateFormData() {
  await requireStaff();
  const [catalog, slots, { currency }] = await Promise.all([
    loadCatalogSnapshot(),
    dishCategoriesService.enabledCategories(),
    getAppSettings(),
  ]);
  return {
    catalog: orderFormCatalog(catalog),
    enabledSlots: slots.map((s) => ({ key: s.key, label: s.label })),
    currency,
  };
}
