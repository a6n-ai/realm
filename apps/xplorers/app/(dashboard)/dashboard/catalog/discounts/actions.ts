"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { setDiscountSettings } from "@/lib/services/app-settings.service";

const PATH = "/dashboard/catalog/discounts";

export type CapState = { error?: string; ok?: boolean };

export async function setDiscountCapAction(_prev: CapState, formData: FormData): Promise<CapState> {
  await requirePermission({ discount: ["update"] });
  try {
    await setDiscountSettings({ maxDiscountPct: Number(formData.get("maxDiscountPct")) });
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(PATH);
  return { ok: true };
}
