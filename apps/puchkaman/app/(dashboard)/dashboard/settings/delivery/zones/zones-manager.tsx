"use client";

import type { ComponentProps } from "react";
import { DeliveryZonesManager, type AddressInputSlot } from "@foundry/delivery/ui";
import { AddressAutocomplete } from "@/components/order/address-autocomplete";

const PlacesInput: AddressInputSlot = ({ id, value, onChange, onPick }) => (
  <AddressAutocomplete
    id={id}
    // The component defaults to the public site's brutalist `.input` class, which is
    // scoped out of the CRM stylesheet — without this the field renders unstyled here.
    className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:ring-3 md:text-sm"
    value={value}
    onChange={onChange}
    onPick={(r) => onPick({ address: r.address, placeId: r.placeId })}
  />
);

/** The shared zones screen with puchkaman's Places autocomplete for the shop address. */
export function ZonesManager(props: Omit<ComponentProps<typeof DeliveryZonesManager>, "addressInput">) {
  return <DeliveryZonesManager {...props} addressInput={PlacesInput} />;
}
