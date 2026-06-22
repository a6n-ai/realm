import { z } from "zod";
import { isValidPhoneNumber, parsePhoneNumber, type CountryCode } from "libphonenumber-js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email"));

export function phoneSchema(defaultCountry: CountryCode = "CA") {
  return z
    .string()
    .trim()
    .refine((v) => isValidPhoneNumber(v, defaultCountry), "Enter a valid phone number")
    .transform((v) => parsePhoneNumber(v, defaultCountry)!.format("E.164"));
}

export function tzToDefaultCountry(timezone: string): CountryCode {
  if (timezone === "Asia/Kolkata") return "IN";
  return "CA";
}
