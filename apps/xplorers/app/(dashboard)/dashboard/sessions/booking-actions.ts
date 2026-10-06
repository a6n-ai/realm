"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { bookingsService } from "@/lib/services/bookings.service";

export async function cancelBookingAction(bookingPublicId: string): Promise<{ error?: string }> {
  await requirePermission({ booking: ["cancel"] });
  try {
    await bookingsService.cancel(bookingPublicId);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath("/dashboard/sessions");
  revalidatePath("/whats-on");
  revalidatePath("/me");
  return {};
}
