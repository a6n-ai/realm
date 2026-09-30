import type { PricingGridRow } from "./pricing-grid";

export const PRICING_STATUSES = [
  { value: "unpriced", label: "Not priced" },
  { value: "offered", label: "Offered" },
  { value: "hidden", label: "Priced, not offered" },
] as const;

const statusOf = (r: PricingGridRow) => (r.pricePerTu == null ? "unpriced" : r.active ? "offered" : "hidden");
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// Rows are category × diet, built in memory, so the URL filters apply here rather than in SQL.
export function filterPricingRows(
  rows: PricingGridRow[],
  sp: { q?: string; diet?: string; status?: string },
): PricingGridRow[] {
  const q = sp.q?.trim().toLowerCase() ?? "";
  const diets = list(sp.diet);
  const statuses = list(sp.status);
  return rows.filter((r) =>
    (!q || r.categoryLabel.toLowerCase().includes(q)) &&
    (!diets.length || diets.includes(r.planKey)) &&
    (!statuses.length || statuses.includes(statusOf(r))));
}
