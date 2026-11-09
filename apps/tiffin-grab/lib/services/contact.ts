import { ValidationError, emailSchema, phoneSchema } from "@foundry/commons";

/** E.164 phone, or a ValidationError. */
export function parsePhone(raw: string): string {
  const parsed = phoneSchema().safeParse(raw);
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

export const parseCustomerContact = (c: { phone: string; email: string | null | undefined }) => ({
  phone: parsePhone(c.phone),
  email: requireEmail(c.email),
});
