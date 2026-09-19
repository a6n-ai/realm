export type DiscountKind = "delivery" | "duration";

export interface DiscountDto {
  publicId: string;
  name: string;
  kind: DiscountKind;
  targetPublicId: string | null;
  percent: number;
  minWeeks: number | null;
  startsAt: string;
  endsAt: string;
  active: boolean;
  startsAtMs: number | null;
  endsAtMs: number | null;
}

export type DiscountStatus = "active" | "inactive" | "scheduled" | "expired";
export type RowType = "delivery" | "duration" | "list_price" | "coupon";

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
  delivery: "Delivery type",
  duration: "Plan length",
  list_price: "List price",
  coupon: "Coupon",
};

export const MEAL_SIZES_HREF = "/dashboard/catalog/meal-sizes";
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

export function buildRows(input: {
  discounts: DiscountDto[];
  frequencies: { publicId: string; name: string }[];
  durations: { publicId: string; weeks: number }[];
  mealSizes: { publicId: string; name: string; type: string; value: string | number }[];
  coupons: { publicId: string; code: string; kind: string; valuePct: string | null; valueAmount: string | null; active: boolean; startsAt: number | null; expiresAt: number | null }[];
  now: number;
}): AllRow[] {
  const freq = new Map(input.frequencies.map((f) => [f.publicId, f.name]));
  const dur = new Map(input.durations.map((d) => [d.publicId, `${d.weeks} weeks`]));
  const rows: AllRow[] = [];

  for (const d of input.discounts) {
    const names = d.kind === "delivery" ? freq : dur;
    rows.push({
      id: d.publicId,
      type: d.kind,
      typeLabel: TYPE_LABELS[d.kind],
      appliesTo: d.targetPublicId == null
        ? (d.kind === "delivery" ? "All delivery types" : "All plan lengths")
        : (names.get(d.targetPublicId) ?? "Unknown target"),
      value: `${fmt(d.percent)}%`,
      status: discountStatus(d, input.now),
      href: null,
      discount: d,
    });
  }
  for (const m of input.mealSizes) {
    if (m.type === "none") continue;
    rows.push({
      id: m.publicId,
      type: "list_price",
      typeLabel: TYPE_LABELS.list_price,
      appliesTo: m.name,
      value: m.type === "percent" ? `${fmt(Number(m.value))}%` : `$${fmt(Number(m.value))} off`,
      status: "active",
      href: MEAL_SIZES_HREF,
      discount: null,
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
