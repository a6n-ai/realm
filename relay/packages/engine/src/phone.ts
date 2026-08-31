import type { Kind } from "./types";

/**
 * Normalize to E.164.
 *
 * This matters more than it looks: suppression is keyed on the address string,
 * so "4165550134" and "+14165550134" would be two different rows and a STOP
 * recorded against one would not block the other. Every phone number entering
 * the system goes through here first.
 *
 * North American default because both apps operate in Canada. A number that
 * already carries a `+` is trusted as-is rather than being re-derived.
 */
export function toE164(raw: string, defaultCountry: "CA" | "US" = "CA"): string | null {
  void defaultCountry; // both are +1; the parameter documents intent for a future split
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    // E.164 allows at most 15 digits; fewer than 8 is not a routable number.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * Whether a number may receive a message of this kind.
 *
 * Marketing requires a VERIFIED number. A phone typed into a delivery form can
 * be mistyped, and a marketing message to a mistyped number reaches a stranger
 * who never consented to anything — a CASL problem and a reputational one.
 * A transactional message to the number attached to that person's own order is
 * defensible without verification.
 */
export function isSmsDeliverable(
  user: { phone: string | null; phoneVerified: boolean },
  kind: Kind,
): boolean {
  if (!user.phone) return false;
  return kind === "transactional" || user.phoneVerified;
}
