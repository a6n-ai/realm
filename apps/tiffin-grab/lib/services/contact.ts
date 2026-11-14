import { ValidationError, emailSchema, phoneSchema } from "@foundry/commons";
import type { Country as CountryCode } from "react-phone-number-input";

/** The app-settings country national numbers are read in. Lazy import: app-settings imports back through session-service. */
export async function appPhoneCountry(): Promise<CountryCode> {
  const { getAppSettings } = await import("./app-settings.service");
  return (await getAppSettings()).defaultCountry;
}

/** E.164 phone, or a ValidationError. One country everywhere, or the same digits dedup as two people. */
export function parsePhone(raw: string, defaultCountry: CountryCode): string {
  const parsed = phoneSchema(defaultCountry).safeParse(raw);
  if (!parsed.success) throw new ValidationError("Enter a valid phone number");
  return parsed.data;
}

/** Lowercased email, or a ValidationError. */
export function parseEmail(raw: string): string {
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("Enter a valid email");
  return parsed.data;
}

/**
 * Email is the login path and the only channel for verification, reset and security alerts, so every
 * customer account needs one. The checkout UI enforces it client-side; this is the trust boundary.
 */
export function requireEmail(raw: string | null | undefined): string {
  const parsed = emailSchema.safeParse(raw?.trim());
  if (!parsed.success) throw new ValidationError("An email address is required");
  return parsed.data;
}

export const parseCustomerContact = (c: { phone: string; email: string | null | undefined }, defaultCountry: CountryCode) => ({
  phone: parsePhone(c.phone, defaultCountry),
  email: requireEmail(c.email),
});
