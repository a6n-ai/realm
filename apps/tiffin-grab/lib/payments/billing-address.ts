import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { resolveProvince } from "@/lib/tax/canada";

/** Stripe billing_details.address. The card form hides every billing field, so all of them come from here. */
export type BillingAddress = { line1: string; line2: string; city: string; state: string; postal_code: string; country: string };
export type AddressInput = { addressLine?: string | null; addressUnit?: string | null; city?: string | null; postalCode?: string | null };

export function billingAddress(a: AddressInput | null | undefined, country: string): BillingAddress {
  const postal = a?.postalCode?.trim() ?? "";
  return {
    line1: a?.addressLine?.trim() ?? "",
    line2: a?.addressUnit?.trim() ?? "",
    city: a?.city?.trim() ?? "",
    state: resolveProvince({ postalCode: postal }) ?? "",
    postal_code: postal,
    country,
  };
}

/** Stripe drops a phone that isn't E.164. */
export function e164(phone: string | null | undefined, country: string): string | null {
  return (phone && parsePhoneNumberFromString(phone, country as CountryCode)?.number) || null;
}
