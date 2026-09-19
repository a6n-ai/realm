"use server";

import { revalidatePath } from "next/cache";
import { Role, ValidationError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { paymentsService } from "@/lib/services/payments.service";

export type ClaimState = { error?: string; ok?: boolean };

export async function claimPaymentAction(publicId: string, _prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const auth = await getSession();
  if (!auth?.user || auth.user.role !== Role.USER) return { error: "Sign in as a family to continue." };
  const reference = String(formData.get("reference") ?? "");
  try {
    await paymentsService.claim(publicId, auth.user.id, reference);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/me/pay/${publicId}`);
  revalidatePath("/me");
  return { ok: true };
}
