import { ValidationError } from "@foundry/commons";
import type { inquiries } from "@/db/schema";

export type LostReason = (typeof inquiries.lostReason.enumValues)[number];

/** The one list of lost / not-renewed reasons: pickers, zod enums, filters, charts and export labels all read it. */
export const LOST_REASON_OPTIONS: { value: LostReason; label: string }[] = [
  { value: "price", label: "Price" },
  { value: "out_of_zone", label: "Out of zone" },
  { value: "no_response", label: "No response" },
  { value: "chose_competitor", label: "Chose competitor" },
  { value: "not_ready", label: "Not ready" },
  { value: "other", label: "Other" },
  { value: "asked_to_stop", label: "Asked to stop" },
];

export const LOST_REASON_LABELS = Object.fromEntries(LOST_REASON_OPTIONS.map((o) => [o.value, o.label])) as Record<LostReason, string>;

export function assertFiniteFollowUp(at: number | null | undefined) {
  if (at != null && !Number.isFinite(at)) throw new ValidationError("Invalid follow-up date");
}
