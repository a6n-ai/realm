"use client";

import { useState } from "react";
import type { AddressValues } from "@foundry/commons";
import type { SavedAddress } from "@foundry/address";
import { formatAddress } from "@foundry/address/ui";
import { setMyDeliveryAddress } from "@/app/(customer)/me/deliveries/actions";
import { Button, Notice, OptionCard, Sheet } from "@/components/customer/kit";
import { AddressFields } from "@/components/customer/address/address-fields";
import { actionAvailability, humanDate } from "@/lib/deliveries-view";
import { currentSavedAddressId } from "@/lib/deliveries-view/current-address";
import type { ActionSheetProps } from "./types";
import { useCommit } from "./use-commit";

/** Send one delivery somewhere else: a saved address or a new one (saved to the book). Never charged. */
export function AddressSheet({ trip, plan, open, onDone }: ActionSheetProps) {
  const av = actionAvailability(trip, Date.now(), plan.ctx).address;
  const addresses = plan.savedAddresses;
  // Open on where this delivery goes today (its own address, else the plan's), not the default.
  const [picked, setPicked] = useState<string | null>(() =>
    currentSavedAddressId(trip.addressOverride ?? null, plan.sub, addresses),
  );
  const [draft, setDraft] = useState<AddressValues>({});
  const { pending, error, run } = useCommit(onDone);
  const day = humanDate(trip.date);

  const confirm = () => {
    if (!trip.deliveryId) return;
    const pick =
      picked !== null
        ? { addressPublicId: picked }
        : {
            newAddress: {
              addressLine: draft.addressLine ?? "",
              addressUnit: draft.addressUnit,
              city: draft.city ?? "",
              postalCode: draft.postalCode ?? "",
              deliveryInstructions: draft.deliveryInstructions,
            },
          };
    void run(() => setMyDeliveryAddress(trip.deliveryId!, pick), () => `Address updated for ${day}.`);
  };

  const footer = (
    <Button variant="primary" size="lg" pending={pending} disabledReason={!av.ok ? (av.why ?? undefined) : undefined} onClick={confirm}>
      Deliver here
    </Button>
  );

  return (
    <Sheet open={open} onClose={() => onDone()} title={`Address for ${day}`} footer={footer}>
      <div className="grid gap-3 pb-2">
        {!av.ok ? (
          <Notice>{av.why}</Notice>
        ) : (
          <>
            <div role="radiogroup" aria-label="Delivery address" className="grid gap-2">
              {addresses.map((a: SavedAddress) => (
                <OptionCard key={a.publicId} role="radio" selected={picked === a.publicId} onClick={() => setPicked(a.publicId)} className="p-4">
                  <span className="block font-medium">
                    {a.label}
                    {a.isDefault ? " · Default" : ""}
                  </span>
                  <span className="block text-sm text-[var(--muted-foreground)]">{formatAddress(a)}</span>
                </OptionCard>
              ))}
              <OptionCard role="radio" selected={picked === null} onClick={() => setPicked(null)} className="p-4">
                <span className="font-medium">+ New address</span>
              </OptionCard>
            </div>
            {picked === null && (
              <AddressFields
                preset="delivery"
                idPrefix="delivery-address"
                fields={["addressLine", "addressUnit", "city", "postalCode", "deliveryInstructions"]}
                values={draft}
                resolveUrl="/api/address/resolve"
                onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              />
            )}
            <p className="text-sm text-[var(--muted-foreground)]">Only this delivery changes. No extra charge.</p>
          </>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Sheet>
  );
}
