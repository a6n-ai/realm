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

export function phoneSchema(defaultCountry: CountryCode = "CA"): z.ZodType<string> {
  return z
    .string()
    .trim()
    .refine((v) => isValidPhoneNumber(v, defaultCountry), "Enter a valid phone number")
    .transform((v, ctx) => {
      const parsed = parsePhoneNumber(v, defaultCountry);
      if (!parsed) {
        ctx.addIssue({ code: "custom", message: "Enter a valid phone number" });
        return z.NEVER;
      }
      return parsed.format("E.164");
    });
}

export function tzToDefaultCountry(timezone: string): CountryCode {
  if (timezone === "Asia/Kolkata") return "IN";
  return "CA";
}
