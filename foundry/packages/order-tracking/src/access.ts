import { isRateLimited } from "@foundry/commons";
import { verifyPin } from "./pin";

/**
 * A 4-digit PIN is 10,000 combinations — safe only because the caller must
 * already hold the order's ~71-bit public id. The attempt limiter is what keeps
 * it that way, so treat these as security parameters, not tuning knobs.
 *
 * Better Auth's own per-endpoint rate limit covers the IP dimension; this one
 * covers the order, so holding one link and grinding it is bounded too.
 */
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const ORDER_NS = "track:pin:order";

export type TrackingSubject = {
  /** Phone on the order — the PIN is derived from it, never stored. */
  phone: string;
  /** Id of the owning user, or null for a guest checkout. */
  ownerUserId: string | null;
};

export type TrackingDecision = "granted" | "pin_required" | "wrong_pin" | "locked";

export type TrackingDecisionInput = {
  orderId: string;
  subject: TrackingSubject;
  /** Id of the logged-in viewer, if any. */
  viewerUserId?: string | null;
  /** PIN submitted with this request. Absent means "just asking". */
  pin?: string | null;
};

/**
 * Pure access decision, split out from the Better Auth endpoint so the rules
 * are testable without standing up an auth instance. The endpoint owns the
 * cookie; this owns the "may they".
 */
export function decideTrackingAccess(input: TrackingDecisionInput): TrackingDecision {
  const { orderId, subject, viewerUserId, pin } = input;

  if (viewerUserId && subject.ownerUserId && viewerUserId === subject.ownerUserId) {
    return "granted";
  }

  if (pin === null || pin === undefined || pin === "") return "pin_required";

  // Charged once per submission, before the compare, so a correct guess on the
  // sixth try is refused like any other.
  if (isRateLimited(orderId, MAX_PIN_ATTEMPTS, PIN_ATTEMPT_WINDOW_MS, ORDER_NS)) {
    return "locked";
  }

  return verifyPin(pin, subject.phone) ? "granted" : "wrong_pin";
}
