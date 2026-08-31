"use client";

import { useState, useTransition } from "react";
import { StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { AddressAutocomplete } from "@/components/order/address-autocomplete";
import { saveStoreOriginFromAddressAction } from "./actions";

/**
 * Every ring is measured from this one point, so it is a property of the shop
 * rather than of any zone — which is why it sits above the map instead of
 * inside the add-zone dialog.
 */
export function StoreOriginField({
  origin,
  onOriginResolved,
}: {
  origin: { lat: number; lng: number };
  onOriginResolved: (lat: number, lng: number) => void;
}) {
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState<string | undefined>(undefined);
  const [pending, start] = useTransition();

  function apply() {
    start(async () => {
      const res = await saveStoreOriginFromAddressAction({ placeId, address });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.lat != null && res.lng != null) {
        onOriginResolved(res.lat, res.lng);
        setAddress(res.formattedAddress ?? address);
        setPlaceId(undefined);
        toast.success("Shop location updated");
      }
    });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="store-origin" className="flex items-center gap-1.5">
          <StoreIcon className="size-3.5" />
          Shop location
        </Label>
        <AddressAutocomplete
          id="store-origin"
          // The component defaults to the public site's brutalist `.input`
          // class, which is scoped out of the CRM stylesheet — without this the
          // field renders unstyled here. Mirrors @foundry/ui's Input.
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:ring-3 md:text-sm"
          value={address}
          onChange={(v) => {
            setAddress(v);
            // A typed edit invalidates the picked suggestion — resolving by a
            // stale placeId would move the shop to the previous address.
            setPlaceId(undefined);
          }}
          onPick={(r) => {
            setAddress(r.address);
            setPlaceId(r.placeId);
          }}
        />
        <p className="text-muted-foreground text-xs tabular-nums">
          Currently {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)} — search an address, or drag the
          pin on the map.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={pending || (!address.trim() && !placeId)}
        onClick={apply}
      >
        {pending ? "Locating…" : "Move shop here"}
      </Button>
    </div>
  );
}
