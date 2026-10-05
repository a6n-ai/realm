import type { DiscountScope, SessionCategory } from "@/db/schema";
import { CATEGORY_LABELS } from "@/lib/sessions/format";

export type DiscountStatus = "active" | "inactive" | "scheduled" | "expired";
export type RowType = "discount" | "coupon";

export type AllRow = {
  id: string;
  type: RowType;
  name: string;
  appliesTo: string;
  value: string;
  uses: string | null;
  status: DiscountStatus;
  href: string;
};

type DiscountInput = {
  publicId: string;
  name: string;
  scope: DiscountScope;
  category: SessionCategory | null;
  sessionTitle: string | null;
  percentOff: string | null;
  amountOff: string | null;
  active: boolean;
  startsAt: number | null;
  endsAt: number | null;
};

type CouponInput = {
  publicId: string;
  code: string;
  name: string;
  percentOff: string | null;
  amountOff: string | null;
  active: boolean;
  startsAt: number | null;
  expiresAt: number | null;
  redemptionCount: number;
  maxRedemptions: number | null;
};

export function discountStatus(
  s: { active: boolean; startsAt: number | null; endsAt: number | null },
  now: number,
): DiscountStatus {
  if (!s.active) return "inactive";
  if (s.startsAt != null && s.startsAt > now) return "scheduled";
  if (s.endsAt != null && s.endsAt < now) return "expired";
  return "active";
}

export function valueLabel(percentOff: string | null, amountOff: string | null): string {
  return percentOff != null ? `${Number(percentOff)}% off` : `$${Number(amountOff).toFixed(2)} off`;
}

function target(d: DiscountInput): string {
  if (d.scope === "all") return "All classes";
  if (d.scope === "category") return `${CATEGORY_LABELS[d.category!]} classes`;
  return d.sessionTitle ?? "Deleted class";
}

export function buildRows(input: { discounts: DiscountInput[]; coupons: CouponInput[]; now: number }): AllRow[] {
  return [
    ...input.discounts.map((d) => ({
      id: d.publicId,
      type: "discount" as const,
      name: d.name,
      appliesTo: target(d),
      value: valueLabel(d.percentOff, d.amountOff),
      uses: null,
      status: discountStatus(d, input.now),
      href: `/dashboard/catalog/discounts/${d.publicId}`,
    })),
    ...input.coupons.map((c) => ({
      id: c.publicId,
      type: "coupon" as const,
      name: c.name,
      appliesTo: `Code ${c.code}`,
      value: valueLabel(c.percentOff, c.amountOff),
      uses: c.maxRedemptions != null ? `${c.redemptionCount} / ${c.maxRedemptions}` : String(c.redemptionCount),
      status: discountStatus({ active: c.active, startsAt: c.startsAt, endsAt: c.expiresAt }, input.now),
      href: `/dashboard/discounts/coupons/${c.publicId}`,
    })),
  ];
}
