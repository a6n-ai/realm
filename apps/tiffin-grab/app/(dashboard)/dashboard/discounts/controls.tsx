import type { planType } from "@/db/schema/catalog";

// Keyed by the plan_type enum (type-only import — erased at compile, no drizzle in the
// client bundle) so adding an enum value is a compile error rather than silent drift.
export type PlanType = (typeof planType.enumValues)[number];
const PLAN_LABEL: Record<PlanType, string> = { tiffin: "Tiffin", healthy: "Healthy" };
export const PLAN_TYPES: { value: PlanType; label: string }[] = (
  Object.keys(PLAN_LABEL) as PlanType[]
).map((value) => ({ value, label: PLAN_LABEL[value] }));

export const pct = (s: string | null): string => (s == null ? "—" : `${Number(s)}%`);

/** Short date range for the coupons list Window column, in the zone the editor round-trips. */
export function formatWindow(startsAt: number | null, expiresAt: number | null, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
  if (startsAt == null && expiresAt == null) return "Always";
  if (startsAt != null && expiresAt == null) return `From ${fmt.format(startsAt)}`;
  if (startsAt == null && expiresAt != null) return `Until ${fmt.format(expiresAt)}`;
  return `${fmt.format(startsAt as number)} – ${fmt.format(expiresAt as number)}`;
}
