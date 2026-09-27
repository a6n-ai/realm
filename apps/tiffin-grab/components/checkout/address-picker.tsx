"use client";

import type { ReactNode } from "react";
import type { SavedAddress } from "@foundry/address";
import { formatAddress } from "@foundry/address/ui";
import { MapPin, Pencil, Plus } from "lucide-react";
import { OptionCard, Pill } from "@/components/customer/kit";

/**
 * Saved addresses and the typed-in one as option cards, then "Add new address", which opens the
 * address sheet. The form itself never sits on the page, so the step stays short on a phone.
 */
export function CheckoutAddressPicker({
  addresses,
  value,
  onPick,
  draft,
  draftFromAccount = false,
  onAdd,
  onEditDraft,
}: {
  addresses: SavedAddress[];
  /** Picked saved address public id; null = the typed-in (draft) address. */
  value: string | null;
  onPick: (address: SavedAddress | null) => void;
  /** The typed-in address on one line; null when there is none. */
  draft: string | null;
  /** The draft is the account's address on file, untouched. */
  draftFromAccount?: boolean;
  onAdd: () => void;
  onEditDraft: () => void;
}) {
  const hasOptions = addresses.length > 0 || draft != null;
  return (
    <div className="grid grid-cols-1 gap-2.5">
      {hasOptions && (
        <div role="radiogroup" aria-label="Delivery address" className="grid grid-cols-1 gap-2.5">
          {addresses.map((a) => (
            <Row key={a.publicId} selected={value === a.publicId} onClick={() => onPick(a)} icon={<MapPin className="size-[18px]" />}>
              <span className="flex items-center gap-2">
                <span className="text-[16px] font-semibold tracking-[-0.01em]">{a.label}</span>
                {a.isDefault && <Pill tone="soft" size="sm">Default</Pill>}
              </span>
              <span className="text-muted-foreground mt-0.5 block text-[13px] text-pretty">{formatAddress(a)}</span>
            </Row>
          ))}
          {draft != null && (
            // Tapping the picked draft again reopens it for editing.
            <Row selected={value === null} onClick={() => (value === null ? onEditDraft() : onPick(null))} icon={<MapPin className="size-[18px]" />}>
              <span className="flex items-center gap-2">
                <span className="text-[16px] font-semibold tracking-[-0.01em]">{draftFromAccount ? "Address on file" : "New address"}</span>
                {draftFromAccount && <Pill tone="soft" size="sm">From your account</Pill>}
              </span>
              <span className="text-muted-foreground mt-0.5 block text-[13px] text-pretty">{draft}</span>
              {value === null && (
                <span className="text-primary mt-1 inline-flex items-center gap-1 text-[13px] font-semibold"><Pencil aria-hidden className="size-3" /> Edit</span>
              )}
            </Row>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="border-border text-foreground hover:bg-muted flex min-h-[60px] w-full items-center gap-3.5 rounded-[20px] border-2 border-dashed px-4 py-3 text-left transition-[transform,background-color] duration-100 active:scale-[.98] motion-reduce:active:scale-100"
      >
        <span aria-hidden className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
          <Plus className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold tracking-[-0.01em]">{hasOptions ? "Add new address" : "Add delivery address"}</span>
          {!hasOptions && <span className="text-muted-foreground block text-[13px]">We&apos;ll check we deliver there.</span>}
        </span>
      </button>
    </div>
  );
}

function Row({ selected, onClick, icon, children }: { selected: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <OptionCard role="radio" selected={selected} onClick={onClick} className="flex min-h-[68px] w-full items-center gap-3.5 px-4 py-3.5">
      <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${selected ? "border-primary" : "border-border"}`}>
        <span className={`bg-primary size-2.5 rounded-full transition-transform duration-200 ${selected ? "scale-100" : "scale-0"}`} />
      </span>
    </OptionCard>
  );
}
