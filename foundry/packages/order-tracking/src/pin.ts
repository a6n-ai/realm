import { timingSafeEqual } from "node:crypto";

export const TRACKING_PIN_LENGTH = 4;

/**
 * The tracking PIN is derived, never stored: it is always the last 4 digits of
 * the phone number on the order. Nothing to seed, reset, or leak.
 *
 * Digits only, so "+1 (416) 555-1234" and "4165551234" agree, and a customer
 * reading the last four off their own phone gets it right regardless of how the
 * number was typed at checkout.
 */
export function derivePin(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < TRACKING_PIN_LENGTH) return null;
  return digits.slice(-TRACKING_PIN_LENGTH);
}

/**
 * Constant-time compare. A 4-digit space is small enough that a timing side
 * channel would meaningfully help, and the comparison is cheap either way.
 */
export function verifyPin(input: string | null | undefined, phone: string | null | undefined): boolean {
  const expected = derivePin(phone);
  if (!expected) return false;

  const given = (input ?? "").replace(/\D/g, "");
  if (given.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"));
}
