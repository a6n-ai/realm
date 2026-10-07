/* eslint-disable react-hooks/purity */
"use client";

import { Fragment, useState } from "react";
import type { AddressValues } from "@foundry/commons";
import type { SavedAddress } from "@foundry/address";
import { formatAddress } from "@foundry/address/ui";
import { setMyDeliveryAddress } from "@/app/(customer)/me/deliveries/actions";
import { AddressDropOffLines, AddressDropOffPanel, DropOffPicker } from "@/components/customer/address/drop-off";
import { NO_DROP_OFF, validDropOff, type DropOffValue } from "@/lib/catalog/drop-off";
import { nameTaken } from "@/components/customer/address/address-name";
import { actionAvailability, humanDate } from "@/lib/deliveries-view";
import { currentSavedAddressId } from "@/lib/deliveries-view/current-address";
import type { ActionSheetProps } from "./types";
import { useCommit } from "./use-commit";
import { useSheetUi } from "./sheet-ui";

/** Send one delivery somewhere else: a saved address or a new one (saved to the book). Never charged. */
export function AddressSheet({ trip, plan, open, onDone, ui }: ActionSheetProps) {
  const { Shell, PrimaryButton, Notice, OptionCard, Field, AddressFields, PillToggle } = useSheetUi(ui);
  const av = actionAvailability(trip, Date.now(), plan.ctx).address;
  const addresses = plan.savedAddresses;
  const [picked, setPicked] = useState<string | null>(() =>
    currentSavedAddressId(trip.addressOverride ?? null, plan.sub, addresses),
  );
  // Re-addressed: this delivery's own drop-off (possibly none); else the plan's address's.
  const [dropOff, setDropOff] = useState<DropOffValue>(() =>
    validDropOff(plan.dropOff, trip.addressOverride ? trip.dropOff : plan.sub.dropOff),
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
        ? { addressPublicId: picked, dropOff }
        : {
            newAddress: {
              label: name.trim() || null,
              addressLine: draft.addressLine ?? "",
              addressUnit: draft.addressUnit,
              city: draft.city ?? "",
              postalCode: draft.postalCode ?? "",
              deliveryInstructions: draft.deliveryInstructions,
            },
            dropOff,
          };
    void run(() => setMyDeliveryAddress(trip.deliveryId!, pick), () => `Address updated for ${day}.`);
  };

  const footer = (
    <PrimaryButton pending={pending} disabledReason={!av.ok ? (av.why ?? undefined) : undefined} onClick={confirm}>
      Deliver here
    </PrimaryButton>
  );

  return (
    <Shell open={open} onClose={() => onDone()} title={`Delivery & Address for ${day}`} footer={footer}>
      <div className="grid gap-4 pb-2">
        {!av.ok ? (
          <Notice>{av.why}</Notice>
        ) : (
          <>
            <div role="radiogroup" aria-label="Delivery address" className="grid gap-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">Address</span>
              {addresses.map((a: SavedAddress) => (
                <Fragment key={a.publicId}>
                  <OptionCard role="radio" selected={picked === a.publicId} onClick={() => {
                    setPicked(a.publicId);
                    // Drop-off belongs to the address: picking one brings its own (or none).
                    setDropOff(validDropOff(plan.dropOff, plan.addressDropOffs?.[a.publicId]));
                  }} className="p-4">
                    <span className="block font-medium">
                      {a.label}
                      {a.isDefault ? " · Default" : ""}
                    </span>
                    <span className="block text-sm text-[var(--muted-foreground)]">{formatAddress(a)}</span>
                    {picked !== a.publicId && (
                      <AddressDropOffLines catalog={plan.dropOff} value={plan.addressDropOffs?.[a.publicId]} note={a.deliveryInstructions} />
                    )}
                  </OptionCard>
                  {picked === a.publicId && (
                    <AddressDropOffPanel>
                      <div className="grid gap-2">
                        {a.deliveryInstructions && <p className="text-[13px] text-[var(--muted-foreground)]">Note: {a.deliveryInstructions}</p>}
                        <DropOffPicker catalog={plan.dropOff} value={dropOff} onChange={setDropOff} Pill={PillToggle} />
                      </div>
                    </AddressDropOffPanel>
                  )}
                </Fragment>
              ))}
              <OptionCard role="radio" selected={picked === null} onClick={() => {
                if (picked !== null) setDropOff(NO_DROP_OFF);
                setPicked(null);
              }} className="p-4">
                <span className="font-medium">+ New address</span>
              </OptionCard>
              {picked === null && (
                <AddressDropOffPanel>
                  <div className="grid gap-4">
                    <Field
                      label="Name"
                      placeholder="Home, Office, Mom's place…"
                      maxLength={40}
                      value={name}
                      error={nameTaken(name, addresses)}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <AddressFields
                      preset="delivery"
                      idPrefix="delivery-address"
                      fields={["addressLine", "addressUnit", "city", "postalCode", "deliveryInstructions"]}
                      values={draft}
                      resolveUrl="/api/address/resolve"
                      onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
                    />
                    <DropOffPicker catalog={plan.dropOff} value={dropOff} onChange={setDropOff} Pill={PillToggle} />
                  </div>
                </AddressDropOffPanel>
              )}
            </div>

            <p className="text-sm text-[var(--muted-foreground)]">This delivery only. Drop-off notes save to the address.</p>
          </>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Shell>
  );
}
