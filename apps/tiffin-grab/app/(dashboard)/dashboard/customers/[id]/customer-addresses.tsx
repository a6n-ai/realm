"use client";

import type { SavedAddress } from "@foundry/address";
import { CustomerAddressesCard } from "@foundry/address/ui";
import { unwrapAction } from "@/lib/actions/unwrap";
import { staffArchiveAddress, staffCreateAddress, staffSetDefaultAddress, staffUpdateAddress } from "./address-actions";

/** Binds the staff actions to this customer — server actions can't be partially applied from a server component. */
export function CustomerAddresses({ customerPublicId, initial }: { customerPublicId: string; initial: SavedAddress[] }) {
  return (
    <CustomerAddressesCard
      title="Saved addresses"
      initial={initial}
      actions={{
        create: (input) => unwrapAction(staffCreateAddress(customerPublicId, input)),
        update: (publicId, input) => unwrapAction(staffUpdateAddress(customerPublicId, publicId, input)),
        setDefault: async (publicId) => {
          await unwrapAction(staffSetDefaultAddress(customerPublicId, publicId));
        },
        archive: (publicId) => unwrapAction(staffArchiveAddress(customerPublicId, publicId)),
      }}
    />
  );
}
