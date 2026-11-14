// How keen a lead that came back is, from how often and how recently it re-inquired, and through which source.

export type ReinquiryHeat = "hot" | "warm" | "cold";
export const REINQUIRY_HEATS: readonly ReinquiryHeat[] = ["hot", "warm", "cold"];

/** Sources the business pays to reach (Meta ads, the website): a re-inquiry through one is a strong signal. */
const PAID_SOURCES = new Set(["facebook", "instagram", "website"]);
const DAY_MS = 86_400_000;
export const REINQUIRY_RECENT_DAYS = 7;
const WARM_DAYS = 30;

/**
 * Hot: 2+ re-inquiries in the last 7 days, or the latest through a paid source within 30 days.
 * Warm: the latest within 30 days. Cold: older than that.
 */
export function heatOf(r: { recent7: number; lastAt: number; sourceKey: string | null }, now: number): ReinquiryHeat {
  const withinWarm = now - r.lastAt <= WARM_DAYS * DAY_MS;
  if (r.recent7 >= 2 || (withinWarm && r.sourceKey != null && PAID_SOURCES.has(r.sourceKey))) return "hot";
  return withinWarm ? "warm" : "cold";
}
