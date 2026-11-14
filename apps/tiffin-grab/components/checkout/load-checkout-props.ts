import "server-only";
import type { ComponentProps } from "react";
import { checkoutPaymentMethods } from "@/lib/checkout/payment-methods";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getContactOnFile } from "@/lib/services/contact-on-file";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { addressService } from "@/lib/services/addresses.service";
import { dropOffsFor } from "@/lib/deliveries/address-drop-off.service";
import { couponsService } from "@/lib/coupons/coupons.service";
import { cardCheckoutContext } from "@/lib/payments/card-checkout-context";
import { resolveProvince } from "@/lib/tax/canada";
import { myRenewalWindow } from "@/lib/deliveries/customer-deliveries.service";
import { pendingFriendGift } from "@/lib/referrals/referrals.service";
import { loadReferralOffer } from "@/lib/referrals/offer";
import type { Checkout } from "./checkout";
import { isProduction } from "@/lib/runtime/env";

export type CheckoutProps = Omit<ComponentProps<typeof Checkout>, "plan" | "closeHref">;

/** Everything Checkout needs for a signed-in customer; null when prod has no payment rail enabled (checkout can't take an order). */
export async function loadCheckoutProps(userId: bigint, sessionUserId: string, orgId: string | null): Promise<CheckoutProps | null> {
  // Pre-fill from the account. Name and email come back read-only and are re-taken from the
  // session server-side; phone and address are editable for this order only.
  const [{ defaultCountry }, snapshot, contact, savedAddresses, coupons, { lastTiffin }, pendingGift, offer] = await Promise.all([
    getAppSettings(),
    loadCatalogSnapshot(orgId),
    getContactOnFile(userId),
    addressService.list({ userId, orgId }),
    couponsService.listAvailable(userId),
    myRenewalWindow(userId),
    pendingFriendGift(userId).catch(() => null),
    loadReferralOffer().catch(() => null),
  ]);
  const referralGift = pendingGift && offer?.friend ? { from: pendingGift.from, figure: offer.friend.big } : null;
  const catalog = toClientCatalog(snapshot);
  const prefill = contact ?? undefined;
  // Auto-apply coupons land on their own; only codes a customer must type are worth suggesting.
  const suggestedCoupons = coupons.filter((c) => !c.autoApply);
  // Province only drives the fee note; an address changed in step 1 keeps the first guess (the server charges by the real one).
  const address = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0] ?? prefill ?? null;
  const province = resolveProvince({ postalCode: address?.postalCode });
  const [cardContext, addressDropOffs] = await Promise.all([
    cardCheckoutContext(sessionUserId, province, address),
    dropOffsFor(savedAddresses.map((a) => a.publicId)),
  ]);

  // Simulated payment is local-only; prod with no rail enabled can't take an order.
  if (isProduction() && (await checkoutPaymentMethods()).length === 0) return null;

  return { defaultCountry, prefill, catalog, savedAddresses, addressDropOffs, suggestedCoupons, lastTiffin, cardContext, referralGift };
}
