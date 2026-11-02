export type PromotionStatus = "live" | "scheduled" | "ended" | "off";

interface Windowed {
  active: boolean;
  startsAt: number | null;
  endsAt: number | null;
}

export function promotionStatus(p: Windowed, now: number): PromotionStatus {
  if (!p.active) return "off";
  if (p.startsAt != null && now < p.startsAt) return "scheduled";
  if (p.endsAt != null && now >= p.endsAt) return "ended";
  return "live";
}

/** Live promotions, highest priority first, then most recently edited. */
export function pickLive<T extends Windowed & { priority: number; updatedAt: number | bigint }>(rows: T[], now: number): T[] {
  return rows
    .filter((p) => promotionStatus(p, now) === "live")
    .sort((a, b) => b.priority - a.priority || Number(b.updatedAt) - Number(a.updatedAt));
}

export const hasPlacement = (p: { placements: string[] }, placement: string) => p.placements.includes(placement);
