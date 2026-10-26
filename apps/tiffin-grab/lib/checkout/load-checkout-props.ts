import "server-only";
import type { ComponentProps } from "react";
import { listCheckoutPaymentMethods } from "@/app/(public)/subscribe/actions";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getContactOnFile } from "@/lib/services/contact-on-file";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { addressService } from "@/lib/services/addresses.service";
import { dropOffsFor } from "@/lib/services/address-drop-off.service";
import { couponsService } from "@/lib/services/coupons.service";
import { cardCheckoutContext } from "@/lib/payments/card-checkout-context";
import { resolveProvince } from "@/lib/tax/canada";
import { myRenewalWindow } from "@/lib/services/customer-deliveries.service";
import type { Checkout } from "@/components/checkout/checkout";

export type CheckoutProps = Omit<ComponentProps<typeof Checkout>, "plan" | "closeHref">;

/** Everything Checkout needs for a signed-in customer; null when prod has no payment rail enabled (checkout can't take an order). */
export async function loadCheckoutProps(userId: bigint, sessionUserId: string, orgId: string | null): Promise<CheckoutProps | null> {
  // Pre-fill from the account. Name and email come back read-only and are re-taken from the
  // session server-side; phone and address are editable for this order only.
  const [{ defaultCountry }, snapshot, contact, savedAddresses, coupons, { lastTiffin }] = await Promise.all([
    getAppSettings(),
    loadCatalogSnapshot(orgId),
    getContactOnFile(userId),
    addressService.list({ userId, orgId }),
    couponsService.listAvailable(userId),
    myRenewalWindow(userId),
  ]);
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
  if (process.env.NODE_ENV === "production" && (await listCheckoutPaymentMethods()).length === 0) return null;

  return { defaultCountry, prefill, catalog, savedAddresses, addressDropOffs, suggestedCoupons, lastTiffin, cardContext };
}
