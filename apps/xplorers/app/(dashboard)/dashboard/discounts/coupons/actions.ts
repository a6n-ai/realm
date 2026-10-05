"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { getAppClock } from "@/lib/services/app-settings.service";
import { couponsService } from "@/lib/services/discounts.service";
import { fromZonedLocal } from "@/lib/sessions/timezone";

const PATH = "/dashboard/discounts/coupons";

export type CouponFormState = { error?: string };

async function couponFields(formData: FormData) {
  const { timezone } = await getAppClock();
  const when = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v ? fromZonedLocal(v, timezone).getTime() : null;
  };
  const valueKind = String(formData.get("valueKind") ?? "percent");
  const value = String(formData.get("value") ?? "");
  return {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    percentOff: valueKind === "percent" ? value : null,
    amountOff: valueKind === "amount" ? value : null,
    minSubtotal: String(formData.get("minSubtotal") ?? ""),
    maxRedemptions: String(formData.get("maxRedemptions") ?? ""),
    maxPerUser: String(formData.get("maxPerUser") ?? ""),
    allowedPaymentMethods: formData.getAll("allowedPaymentMethods").map(String),
    startsAt: when("startsAt"),
    expiresAt: when("expiresAt"),
    stackable: formData.get("stackable") === "on",
    active: formData.get("active") === "on",
  };
}

function revalidate() {
  revalidatePath(PATH);
  revalidatePath("/dashboard/catalog/discounts");
}

export async function createCouponAction(_prev: CouponFormState, formData: FormData): Promise<CouponFormState> {
  await requirePermission({ discount: ["create"] });
  try {
    await couponsService.create(await couponFields(formData));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidate();
  redirect(PATH);
}

export async function updateCouponAction(
  publicId: string,
  _prev: CouponFormState,
  formData: FormData,
): Promise<CouponFormState> {
  await requirePermission({ discount: ["update"] });
  try {
    await couponsService.update(publicId, await couponFields(formData));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidate();
  redirect(PATH);
}
