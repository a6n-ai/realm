"use client";

import type { SavedAddress } from "@foundry/address";
import { formatAddress } from "@foundry/address/ui";
import { OptionCard } from "@/components/customer/kit";

/** Saved addresses as option cards + "New address". Renders nothing when there are none (guests). */
export function CheckoutAddressPicker({
  addresses,
  value,
  onPick,
}: {
  addresses: SavedAddress[];
  /** Picked saved address public id; null = "New address". */
  value: string | null;
  onPick: (address: SavedAddress | null) => void;
}) {
  if (addresses.length === 0) return null;
  return (
    <div role="radiogroup" aria-label="Delivery address" className="grid gap-2">
      {addresses.map((a) => (
        <OptionCard key={a.publicId} role="radio" selected={value === a.publicId} onClick={() => onPick(a)} className="p-4">
          <span className="block font-medium">
            {a.label}
            {a.isDefault ? " · Default" : ""}
          </span>
          <span className="block text-sm text-muted-foreground">{formatAddress(a)}</span>
        </OptionCard>
      ))}
      <OptionCard role="radio" selected={value === null} onClick={() => onPick(null)} className="p-4">
        <span className="font-medium">+ New address</span>
      </OptionCard>
    </div>
  );
}
