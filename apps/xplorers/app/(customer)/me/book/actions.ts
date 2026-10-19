"use server";

import { redirect } from "next/navigation";
import { Role, ValidationError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { bookingsService, type BookingRequest } from "@/lib/services/bookings.service";
import { childrenService } from "@/lib/services/children.service";
import type { ChildView, QuoteView } from "@/components/customer/book/types";

type Failure = { error: string };
const SIGN_IN: Failure = { error: "Sign in to book." };

async function familyId(): Promise<string | null> {
  const auth = await getSession();
  return auth?.user && auth.user.role === Role.USER ? auth.user.id : null;
}

/** Only the fields the booking needs: nothing else the client sends reaches the service. */
function pick(req: BookingRequest): BookingRequest {
  return {
    occurrencePublicId: req.occurrencePublicId,
    startsAt: req.startsAt,
    choice: req.choice,
    extensionSteps: req.extensionSteps,
    childPublicIds: req.childPublicIds,
    adults: req.adults,
    code: req.code ?? null,
    useCoins: Boolean(req.useCoins),
    methodId: req.methodId,
  };
}

function inline(err: unknown): Failure {
  if (err instanceof ValidationError) return { error: err.message };
  throw err;
}

export async function quoteAction(req: BookingRequest): Promise<{ quote: QuoteView } | Failure> {
  const user = await familyId();
  if (!user) return SIGN_IN;
  try {
    const q = await bookingsService.quote(pick(req), user);
    return {
      quote: {
        endsAt: q.endsAt.toISOString(),
        perChild: q.perChild,
        extensionPerChild: q.extensionPerChild,
        extraAdults: q.extraAdults,
        adultCharge: q.adultCharge,
        subtotal: q.lines.subtotal,
        adjustments: q.lines.adjustments,
        taxTotal: q.lines.taxTotal,
        total: q.total,
        codeError: q.lines.codeError,
        currency: q.currency,
      },
    };
  } catch (err) {
    return inline(err);
  }
}

export async function createChildAction(input: { name: string; dateOfBirth: string }): Promise<{ child: ChildView } | Failure> {
  if (!(await familyId())) return SIGN_IN;
  try {
    const row = await childrenService.createMine({ name: String(input.name), dateOfBirth: String(input.dateOfBirth) });
    return { child: { publicId: row.publicId, name: row.name, dateOfBirth: row.dateOfBirth } };
  } catch (err) {
    return inline(err);
  }
}

export async function bookAction(req: BookingRequest): Promise<Failure> {
  const user = await familyId();
  if (!user) return SIGN_IN;
  let target: string;
  try {
    const result = await bookingsService.createForUser(user, pick(req));
    target = result.paymentPublicId
      ? `/me/pay/${result.paymentPublicId}${result.codeError ? `?codeError=${result.codeError}` : ""}`
      : "/me/classes?booked=1";
  } catch (err) {
    return inline(err);
  }
  redirect(target);
}
