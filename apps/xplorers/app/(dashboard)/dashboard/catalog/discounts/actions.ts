"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { attempt } from "@/lib/actions/guard";
import { requirePermission } from "@/lib/auth/guards";
import { getAppClock, setDiscountSettings } from "@/lib/services/app-settings.service";
import { discountsService } from "@/lib/services/discounts.service";
import { fromZonedLocal } from "@/lib/sessions/timezone";

const PATH = "/dashboard/catalog/discounts";

export type CapState = { error?: string; ok?: boolean };

export async function setDiscountCapAction(_prev: CapState, formData: FormData): Promise<CapState> {
  const r = await attempt(async () => {
    await requirePermission({ discount: ["update"] });
    return setDiscountSettings({ maxDiscountPct: formData.get("maxDiscountPct") });
  });
  if ("error" in r) return r;
  revalidatePath(PATH);
  return { ok: true };
}

export type DiscountFormState = { error?: string };

async function discountFields(formData: FormData) {
  const { timezone } = await getAppClock();
  const when = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v ? fromZonedLocal(v, timezone).getTime() : null;
  };
  const valueKind = String(formData.get("valueKind") ?? "percent");
  const value = String(formData.get("value") ?? "");
  return {
    name: String(formData.get("name") ?? ""),
    scope: String(formData.get("scope") ?? "all"),
    category: String(formData.get("category") ?? ""),
    sessionPublicId: String(formData.get("sessionPublicId") ?? "") || null,
    percentOff: valueKind === "percent" ? value : null,
    amountOff: valueKind === "amount" ? value : null,
    minSubtotal: String(formData.get("minSubtotal") ?? ""),
    startsAt: when("startsAt"),
    endsAt: when("endsAt"),
    stackable: formData.get("stackable") === "on",
    active: formData.get("active") === "on",
  };
}

export async function createDiscountAction(_prev: DiscountFormState, formData: FormData): Promise<DiscountFormState> {
  const r = await attempt(async () => {
    await requirePermission({ discount: ["create"] });
    await discountsService.create(await discountFields(formData));
  });
  if ("error" in r) return r;
  revalidatePath(PATH);
  redirect(PATH);
}

export async function updateDiscountAction(
  publicId: string,
  _prev: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const r = await attempt(async () => {
    await requirePermission({ discount: ["update"] });
    await discountsService.update(publicId, await discountFields(formData));
  });
  if ("error" in r) return r;
  revalidatePath(PATH);
  redirect(PATH);
}
