"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import type { PriceTable } from "@/lib/pricing/types";
import { setDefaultPrices } from "@/lib/services/app-settings.service";

export async function saveDefaultPrices(table: PriceTable) {
  await requireAdmin();
  await setDefaultPrices(table);
  revalidatePath("/dashboard/settings/pricing");
}
