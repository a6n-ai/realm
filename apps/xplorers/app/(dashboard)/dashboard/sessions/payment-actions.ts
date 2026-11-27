"use server";

import { revalidatePath } from "next/cache";
import { attempt } from "@/lib/actions/guard";
import { requirePermission } from "@/lib/auth/guards";
import { paymentsService } from "@/lib/services/payments.service";

export async function verifyPaymentAction(publicId: string): Promise<{ error?: string }> {
  const r = await attempt(async () => {
    await requirePermission({ studioSession: ["update"] } as never);
    return paymentsService.verify(publicId);
  });
  if ("error" in r) return r;
  revalidatePath("/dashboard/sessions");
  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/payments", "layout");
  return {};
}

export async function rejectPaymentAction(publicId: string): Promise<{ error?: string }> {
  const r = await attempt(async () => {
    await requirePermission({ studioSession: ["update"] } as never);
    return paymentsService.reject(publicId);
  });
  if ("error" in r) return r;
  revalidatePath("/dashboard/sessions");
  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/payments", "layout");
  return {};
}
