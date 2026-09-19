"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { paymentsService } from "@/lib/services/payments.service";

export async function verifyPaymentAction(publicId: string): Promise<{ error?: string }> {
  await requirePermission({ studioSession: ["update"] } as never);
  try {
    await paymentsService.verify(publicId);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath("/dashboard/sessions");
  return {};
}

export async function rejectPaymentAction(publicId: string): Promise<{ error?: string }> {
  await requirePermission({ studioSession: ["update"] } as never);
  try {
    await paymentsService.reject(publicId);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath("/dashboard/sessions");
  return {};
}
