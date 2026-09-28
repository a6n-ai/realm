import type { WaiverKind } from "@/lib/catalog/types";

export type DiscountKind = "delivery" | "duration" | "meal_size";

export interface DiscountDto {
  publicId: string;
  name: string;
  kind: DiscountKind | WaiverKind;
  targetPublicId: string | null;
  percent: number;
  /** Flat $ off; meal_size only. */
  amount: number | null;
  minWeeks: number | null;
  startsAt: string;
  endsAt: string;
  active: boolean;
  startsAtMs: number | null;
  endsAtMs: number | null;
}

export type DiscountStatus = "active" | "inactive" | "scheduled" | "expired";
export type RowType = DiscountKind | "coupon";

export interface AllRow {
  id: string;
  type: RowType;
  typeLabel: string;
  appliesTo: string;
  value: string;
  status: DiscountStatus;
  href: string | null;
  discount: DiscountDto | null;
}

export const TYPE_LABELS: Record<RowType, string> = {
  delivery: "Delivery frequency",
  duration: "Plan length",
  meal_size: "Meal size",
  coupon: "Coupon",
};

export const COUPONS_HREF = "/dashboard/discounts/coupons";

export function discountStatus(
  s: { active: boolean; startsAtMs?: number | null; endsAtMs?: number | null },
  now: number,
): DiscountStatus {
  if (!s.active) return "inactive";
  if (s.startsAtMs != null && s.startsAtMs > now) return "scheduled";
  if (s.endsAtMs != null && s.endsAtMs < now) return "expired";
  return "active";
}

const fmt = (n: number) => `${Number(n)}`;

export const ALL_TARGETS_LABEL: Record<DiscountKind, string> = {
  delivery: "All delivery frequencies",
  duration: "All plan lengths",
  meal_size: "All meal sizes",
};

export const discountValueLabel = (d: Pick<DiscountDto, "percent" | "amount">) =>
  d.amount != null && d.amount > 0 ? `$${fmt(d.amount)} off` : `${fmt(d.percent)}%`;

export function buildRows(input: {
  discounts: DiscountDto[];
  frequencies: { publicId: string; name: string }[];
  durations: { publicId: string; weeks: number }[];
  mealSizes: { publicId: string; name: string }[];
  coupons: { publicId: string; code: string; kind: string; valuePct: string | null; valueAmount: string | null; active: boolean; startsAt: number | null; expiresAt: number | null }[];
  now: number;
}): AllRow[] {
  const names: Record<DiscountKind, Map<string, string>> = {
    delivery: new Map(input.frequencies.map((f) => [f.publicId, f.name])),
    duration: new Map(input.durations.map((d) => [d.publicId, `${d.weeks} weeks`])),
    meal_size: new Map(input.mealSizes.map((m) => [m.publicId, m.name])),
  };
  const rows: AllRow[] = [];

  for (const d of input.discounts) {
    if (d.kind.startsWith("waiver_")) continue; // listed on the Waivers tab
    const kind = d.kind as DiscountKind;
    rows.push({
      id: d.publicId,
      type: kind,
      typeLabel: TYPE_LABELS[kind],
      appliesTo: d.targetPublicId == null ? ALL_TARGETS_LABEL[kind] : (names[kind].get(d.targetPublicId) ?? "Unknown target"),
      value: discountValueLabel(d),
      status: discountStatus(d, input.now),
      href: null,
      discount: d,
    });
  }
  for (const c of input.coupons) {
    rows.push({
      id: c.publicId,
      type: "coupon",
      typeLabel: TYPE_LABELS.coupon,
      appliesTo: c.code,
      value: c.kind === "percentage" && c.valuePct != null ? `${fmt(Number(c.valuePct))}%`
        : c.kind === "fixed" && c.valueAmount != null ? `$${fmt(Number(c.valueAmount))} off`
        : c.kind.replace(/_/g, " "),
      status: discountStatus({ active: c.active, startsAtMs: c.startsAt, endsAtMs: c.expiresAt }, input.now),
      href: COUPONS_HREF,
      discount: null,
    });
  }
  return rows;
}
