import "server-only";
import { eq } from "drizzle-orm";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { SavedCard } from "@foundry/payments/stripe";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { stripeRuntime } from "@/lib/payments/stripe";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listSavedCards } from "@/lib/services/payment-stripe";

export type CardCheckoutContext = {
  publishableKey: string | null;
  methodLabel: string;
  savedCards: SavedCard[];
  /** Billing defaults for Stripe: phone in E.164 (Stripe drops anything else), country as ISO code. */
  prefill: { email: string; name: string; phone: string | null; country: string; postalCode: string | null };
  feeNote: string | null;
};

export async function cardCheckoutContext(userPublicId: string, province: string | null, postalCode: string | null = null): Promise<CardCheckoutContext> {
  const [rt, savedCards, [u], { defaultCountry }] = await Promise.all([
    stripeRuntime(),
    listSavedCards(userPublicId),
    db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.publicId, userPublicId)).limit(1),
    getAppSettings(),
  ]);
  const s = rt?.cfg.surcharge;
  // Unknown province: surchargeCents charges 0, so no note either.
  const fee = s?.enabled && s.ratePct > 0 && !!province && !s.excludeProvinces.includes(province.toUpperCase());
  return {
    publishableKey: rt?.cfg.publishableKey ?? null,
    methodLabel: rt?.cfg.methodLabel ?? "Pay with Stripe",
    savedCards,
    prefill: {
      email: u?.email ?? "",
      name: u?.name ?? "",
      phone: (u?.phone && parsePhoneNumberFromString(u.phone, defaultCountry)?.number) || null,
      country: defaultCountry,
      postalCode,
    },
    feeNote: fee ? `+${s.ratePct}% fee on credit cards` : null,
  };
}
