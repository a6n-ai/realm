"use client";

import { useState } from "react";
import type { AddressValues } from "@foundry/commons";
import type { SavedAddress } from "@foundry/address";
import { formatAddress } from "@foundry/address/ui";
import { setMyDeliveryAddress } from "@/app/(customer)/me/deliveries/actions";
import { Button, Field, Notice, OptionCard, Sheet } from "@/components/customer/kit";
import { DropOffPicker } from "@/components/customer/address/drop-off";
import { nameTaken } from "@/components/customer/address/address-name";
import { AddressFields } from "@/components/customer/address/address-fields";
import { actionAvailability, humanDate } from "@/lib/deliveries-view";
import { currentSavedAddressId } from "@/lib/deliveries-view/current-address";
import type { ActionSheetProps } from "./types";
import { useCommit } from "./use-commit";

/** Send one delivery somewhere else: a saved address or a new one (saved to the book). Never charged. */
export function AddressSheet({ trip, plan, open, onDone }: ActionSheetProps) {
  const av = actionAvailability(trip, Date.now(), plan.ctx).address;
  const addresses = plan.savedAddresses;
  const strategies = plan.deliveryStrategies;
  
  // Initialize with current address and strategy
  const currentStrategy = trip.deliveryId ? null : null; // We need a way to know the current strategy. Actually, trip doesn't expose it, so default to first or null. Let's just allow changing it.
  const [picked, setPicked] = useState<string | null>(() =>
    currentSavedAddressId(trip.addressOverride ?? null, plan.sub, addresses),
  );
  // Default to plan's strategy if trip doesn't have an override exposed, or first strategy
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(
    plan.sub.deliveryStrategyPublicId ?? strategies[0]?.publicId ?? null
  );
  
  const [draft, setDraft] = useState<AddressValues>({});
  // A new address is saved to the book too, so it gets a name there.
  const [name, setName] = useState("");
  const { pending, error, run } = useCommit(onDone);
  const day = humanDate(trip.date);

  const confirm = () => {
    if (!trip.deliveryId) return;
    const pick =
      picked !== null
        ? { addressPublicId: picked, deliveryStrategyPublicId: selectedStrategy ?? undefined }
        : {
            newAddress: {
              label: name.trim() || null,
              addressLine: draft.addressLine ?? "",
              addressUnit: draft.addressUnit,
              city: draft.city ?? "",
              postalCode: draft.postalCode ?? "",
              deliveryInstructions: draft.deliveryInstructions,
            },
            deliveryStrategyPublicId: selectedStrategy ?? undefined,
          };
    void run(() => setMyDeliveryAddress(trip.deliveryId!, pick), () => `Address updated for ${day}.`);
  };

  const footer = (
    <Button variant="primary" size="lg" pending={pending} disabledReason={!av.ok ? (av.why ?? undefined) : undefined} onClick={confirm}>
      Deliver here
    </Button>
  );

  return (
    <Sheet open={open} onClose={() => onDone()} title={`Delivery & Address for ${day}`} footer={footer}>
      <div className="grid gap-4 pb-2">
        {!av.ok ? (
          <Notice>{av.why}</Notice>
        ) : (
          <>
            <DropOffPicker options={strategies} value={selectedStrategy} onChange={setSelectedStrategy} />

            <div role="radiogroup" aria-label="Delivery address" className="grid gap-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">Address</span>
              {addresses.map((a: SavedAddress) => (
                <OptionCard key={a.publicId} role="radio" selected={picked === a.publicId} onClick={() => {
                  setPicked(a.publicId);
                  // A saved address brings its own drop-off.
                  const own = plan.addressDropOffs?.[a.publicId];
                  if (own) setSelectedStrategy(own);
                }} className="p-4">
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
              <Field
                label="Name"
                placeholder="Home, Office, Mom's place…"
                maxLength={40}
                value={name}
                error={nameTaken(name, addresses)}
                onChange={(e) => setName(e.target.value)}
              />
            )}
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
