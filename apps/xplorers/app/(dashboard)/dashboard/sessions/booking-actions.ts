"use server";

import { revalidatePath } from "next/cache";
import { attempt } from "@/lib/actions/guard";
import { requirePermission } from "@/lib/auth/guards";
import { bookingsService } from "@/lib/services/bookings.service";

export async function cancelBookingAction(bookingPublicId: string): Promise<{ error?: string }> {
  const r = await attempt(async () => {
    await requirePermission({ booking: ["cancel"] });
    return bookingsService.cancel(bookingPublicId);
  });
  if ("error" in r) return r;
  revalidatePath("/dashboard/sessions");
  revalidatePath("/whats-on");
  revalidatePath("/me");
  return {};
}
