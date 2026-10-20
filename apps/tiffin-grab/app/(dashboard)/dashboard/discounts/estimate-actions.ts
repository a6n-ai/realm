"use server";

import { eq } from "drizzle-orm";
import { createShortLink } from "@foundry/shortlinks";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { quoteQuery } from "@/components/wizard/selections";
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

// The short /q/ link for an estimate. Only the quote params are kept, so the stored target is
// always the subscribe stepper; created_by is the signed-in staff member, never client input.
export async function createQuoteLink(query: string): Promise<{ code: string } | { error: string }> {
  await requireStaff();
  const qs = quoteQuery(new URLSearchParams(query));
  if (!qs) return { error: "Nothing to link to yet" };
  const publicId = (await getSession())?.user?.id;
  const [staff] = publicId ? await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1) : [];
  try {
    return { code: await createShortLink(db, { target: `/subscribe${qs}`, createdBy: staff?.id ?? null }) };
  } catch {
    return { error: "Couldn't create a short link" };
  }
}
