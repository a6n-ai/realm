"use client";

import type { SavedAddress } from "@foundry/address";
import { CustomerAddressesCard } from "@foundry/address/ui";
import { staffArchiveAddress, staffCreateAddress, staffSetDefaultAddress, staffUpdateAddress } from "./address-actions";

/** Binds the staff actions to this customer — server actions can't be partially applied from a server component. */
export function CustomerAddresses({ customerPublicId, initial }: { customerPublicId: string; initial: SavedAddress[] }) {
  return (
    <CustomerAddressesCard
      title="Saved addresses"
      initial={initial}
      actions={{
        create: (input) => staffCreateAddress(customerPublicId, input),
        update: (publicId, input) => staffUpdateAddress(customerPublicId, publicId, input),
        setDefault: (publicId) => staffSetDefaultAddress(customerPublicId, publicId),
        archive: (publicId) => staffArchiveAddress(customerPublicId, publicId),
      }}
    />
  );
}
