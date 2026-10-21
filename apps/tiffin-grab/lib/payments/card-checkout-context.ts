import "server-only";
import { eq } from "drizzle-orm";
import type { SavedCard } from "@foundry/payments/stripe";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { stripeRuntime } from "@/lib/payments/stripe";
import { listSavedCards } from "@/lib/services/payment-stripe";

export type CardCheckoutContext = {
  publishableKey: string | null;
  methodLabel: string;
  savedCards: SavedCard[];
  prefill: { email: string; name: string; phone: string | null };
  feeNote: string | null;
};

export async function cardCheckoutContext(userPublicId: string, province: string | null): Promise<CardCheckoutContext> {
  const [rt, savedCards, [u]] = await Promise.all([
    stripeRuntime(),
    listSavedCards(userPublicId),
    db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.publicId, userPublicId)).limit(1),
  ]);
  const s = rt?.cfg.surcharge;
  const fee = s?.enabled && s.ratePct > 0 && !(province && s.excludeProvinces.includes(province.toUpperCase()));
  return {
    publishableKey: rt?.cfg.publishableKey ?? null,
    methodLabel: rt?.cfg.methodLabel ?? "Pay with Stripe",
    savedCards,
    prefill: { email: u?.email ?? "", name: u?.name ?? "", phone: u?.phone ?? null },
    feeNote: fee ? `+${s.ratePct}% fee on credit cards` : null,
  };
}
