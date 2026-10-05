"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRateLimited, Role, ValidationError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import type { BookingPricing } from "@/db/schema";
import { CODE_ERROR_MESSAGE, toPricing } from "@/lib/discounts/quote";
import { bookingsService } from "@/lib/services/bookings.service";
import { discountsService } from "@/lib/services/discounts.service";

export type BookState = { error?: string };

const CODE_TRY_LIMIT = 20;
const CODE_TRY_WINDOW_MS = 10 * 60_000;
const TOO_MANY_TRIES = "Too many code tries. Wait a few minutes and try again.";

/** Caps code guessing per family across previews and bookings. */
function codeTriesExceeded(userPublicId: string, code: string): boolean {
  return code.trim() !== "" && isRateLimited(userPublicId, CODE_TRY_LIMIT, CODE_TRY_WINDOW_MS, "coupon-code");
}
export type QuoteState = { error?: string; quote?: BookingPricing & { currency: string }; codeMessage?: string };

/** Preview only. The booking re-prices on the server inside its transaction. */
export async function quoteBookingAction(occurrencePublicId: string, seats: number, code: string): Promise<QuoteState> {
  const auth = await getSession();
  if (!auth?.user || auth.user.role !== Role.USER) return { error: "Sign in as a family to continue." };
  if (!Number.isInteger(seats) || seats < 1) return { error: "Pick at least one seat." };
  if (codeTriesExceeded(auth.user.id, code)) return { error: TOO_MANY_TRIES };
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
  // Bookings share the guess bucket, but a spent bucket drops the code rather than blocking the booking.
  const typed = String(formData.get("code") ?? "");
  const code = codeTriesExceeded(auth.user.id, typed) ? null : typed;

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
