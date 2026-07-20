import type { AddressValues } from "@realm/commons";
import { cn } from "./cn";

function joinNonEmpty(parts: Array<string | undefined | null>) {
  return parts.map((p) => p?.trim()).filter(Boolean).join(" ");
}

export type AddressDisplayProps = {
  address: AddressValues;
  className?: string;
  /**
   * When true, prefer a slightly more compact line:
   *   "Full name · 123 Maple St, Toronto M5V 2T6"
   * When false, prefer:
   *   "Full name · 123 Maple St, Toronto • M5V 2T6"
   */
  compact?: boolean;
};

/**
 * Single source of truth for how we display an address across the app.
 * This is intentionally presentational only (no inputs), so it can be used
 * in tables, summaries, and tiles.
 */
export function AddressDisplay({ address, className, compact = true }: AddressDisplayProps) {
  const fullName = address.fullName?.trim();
  const street = joinNonEmpty([address.addressLine, address.addressUnit]);
  const locality = joinNonEmpty([
    address.city,
    address.province ? `${address.province}` : undefined,
  ]);
  const postal = address.postalCode?.trim();

  const lineA = street && locality ? `${street}, ${locality}` : street ?? locality ?? "";

  const main = lineA
    ? compact
      ? joinNonEmpty([lineA, postal])
      : joinNonEmpty([lineA, postal ? `• ${postal}` : undefined])
    : postal ?? "";

  return (
    <span className={cn("inline", className)}>
      {fullName ? `${fullName} · ${main}` : main}
    </span>
  );
}

