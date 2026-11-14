import { formatPhone } from "@foundry/commons";

export function displayName(i: { fullName: string | null; phone: string | null }): string {
  return i.fullName?.trim() || formatPhone(i.phone) || "Unnamed lead";
}

/** Catalog plan name for a stored plan interest: a plan key, or older free text matched by name. */
export function planLabelFor(plans: { key: string; name: string }[], value: string | null): string | null {
  if (!value) return value;
  return (
    plans.find((p) => p.key === value)?.name ??
    plans.find((p) => p.name.toLowerCase() === value.trim().toLowerCase())?.name ??
    value
  );
}

/** Rank of an order among the customer's orders (1 = first). Null means the first-sale round too. */
export function roundLabel(rank: number | null): string {
  return rank == null || rank <= 1 ? "First sale" : `Renewal ${rank - 1}`;
}
