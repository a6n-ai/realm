"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@foundry/commons";
import { attempt } from "@/lib/actions/guard";
import { getSession } from "@/lib/auth/session";
import { paymentsService } from "@/lib/services/payments.service";

export type ClaimState = { error?: string; ok?: boolean };

export async function claimPaymentAction(publicId: string, _prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const auth = await getSession();
  if (!auth?.user || auth.user.role !== Role.USER) return { error: "Sign in to continue." };
  const reference = String(formData.get("reference") ?? "");
  const r = await attempt(() => paymentsService.claim(publicId, auth.user.id, reference));
  if ("error" in r) return r;
  revalidatePath(`/me/pay/${publicId}`);
  revalidatePath("/me");
  return { ok: true };
}
