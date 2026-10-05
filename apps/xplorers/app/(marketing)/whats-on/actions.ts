"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role, ValidationError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import type { BookingPricing } from "@/db/schema";
import { CODE_ERROR_MESSAGE, toPricing } from "@/lib/discounts/quote";
import { bookingsService } from "@/lib/services/bookings.service";
import { discountsService } from "@/lib/services/discounts.service";

export type BookState = { error?: string };
export type QuoteState = { error?: string; quote?: BookingPricing & { currency: string }; codeMessage?: string };

/** Preview only. The booking re-prices on the server inside its transaction. */
export async function quoteBookingAction(occurrencePublicId: string, seats: number, code: string): Promise<QuoteState> {
  const auth = await getSession();
  if (!auth?.user || auth.user.role !== Role.USER) return { error: "Sign in as a family to continue." };
  if (!Number.isInteger(seats) || seats < 1) return { error: "Pick at least one seat." };
  try {
    const q = await discountsService.quoteForOccurrence(occurrencePublicId, seats, code, auth.user.id);
    return {
      quote: { ...toPricing(q), currency: q.currency },
      ...(q.codeError ? { codeMessage: CODE_ERROR_MESSAGE[q.codeError] } : {}),
    };
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
}

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
  const code = String(formData.get("code") ?? "");

  try {
    const booking = await bookingsService.createForUser(auth.user.id, occurrencePublicId, seats, { code });
    revalidatePath("/whats-on");
    revalidatePath("/");
    revalidatePath("/me");
    if (booking.paymentPublicId) {
      redirect(`/me/pay/${booking.paymentPublicId}${booking.codeError ? `?codeError=${booking.codeError}` : ""}`);
    }
    redirect("/me");
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
}
