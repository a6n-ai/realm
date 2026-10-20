import type { AddonRequest } from "@/db/schema";
import type { OrderPricingSnapshot } from "@/lib/pricing/types";

export type Line = { label: string; amount: number };

// An add-on payment charges only the quoted add-on, so it must not show the whole order's snapshot.
export function payPageLines(
  pay: { amount: string; addonRequest: AddonRequest | null },
  order: { pricingSnapshot: unknown },
): { lines: Line[]; taxLines: Line[]; total: number } {
  const total = Number(pay.amount);
  const req = pay.addonRequest;
  if (req) {
    const itemised = req.taxes.length > 0 && req.taxes.every((t) => t.amount != null);
    return {
      lines: req.lines.map((l) => ({ label: l.label, amount: l.amount })),
      taxLines: itemised
        ? req.taxes.map((t) => ({ label: `${t.name} ${t.ratePct}%`, amount: t.amount! }))
        : req.taxTotal > 0 ? [{ label: "Tax", amount: req.taxTotal }] : [],
      total,
    };
  }
  const snap = order.pricingSnapshot as OrderPricingSnapshot;
  return {
    lines: [
      ...snap.lineItems.map((l) => ({ label: l.label, amount: l.amount })),
      ...snap.adjustments.map((a) => ({ label: a.label, amount: -a.amount })),
    ],
    taxLines: snap.taxLines.map((t) => ({ label: `${t.name} ${t.ratePct}%`, amount: t.amount })),
    total,
  };
}
