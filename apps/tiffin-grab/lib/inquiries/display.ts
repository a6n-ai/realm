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
