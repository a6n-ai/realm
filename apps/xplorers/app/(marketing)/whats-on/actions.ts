"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role, ValidationError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { bookingsService } from "@/lib/services/bookings.service";

export type BookState = { error?: string };

export async function createBookingAction(_prev: BookState, formData: FormData): Promise<BookState> {
  const occurrencePublicId = String(formData.get("occurrencePublicId") ?? formData.get("sessionPublicId") ?? "").trim();
  if (!occurrencePublicId) return { error: "Pick a session to book." };

  const callback = `/whats-on?book=${occurrencePublicId}`;
  const auth = await getSession();
  if (!auth?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  }
  if (auth.user.role !== Role.USER) {
    return { error: "Sign in as a family to continue." };
  }

  const raw = formData.get("seats");
  const seats = raw == null || String(raw).trim() === "" ? 1 : Number(raw);

  try {
    await bookingsService.createForUser(auth.user.id, occurrencePublicId, seats);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }

  revalidatePath("/whats-on");
  revalidatePath("/");
  revalidatePath("/me");
  redirect("/me");
}
