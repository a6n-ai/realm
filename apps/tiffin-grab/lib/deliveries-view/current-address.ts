import type { SavedAddress } from "@foundry/address";

type Place = { addressLine: string; postalCode: string };

const key = (p: Place) => `${p.addressLine.trim().toLowerCase()}|${p.postalCode.replace(/\s+/g, "").toUpperCase()}`;

/**
 * The saved address a delivery currently goes to: its own override if re-addressed, else the
 * plan's address. Falls back to the default when neither matches a saved one.
 */
export function currentSavedAddressId(override: Place | null, plan: Place, addresses: SavedAddress[]): string | null {
  const want = key(override ?? plan);
  return (
    addresses.find((a) => key(a) === want)?.publicId ??
    addresses.find((a) => a.isDefault)?.publicId ??
    addresses[0]?.publicId ??
    null
  );
}
