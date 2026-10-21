"use client";

import type { SavedCard } from "@foundry/payments/stripe";
import { Choice, ChoiceGroup, Pill } from "@/components/customer/kit";

const brandName = (b: string | null) => (b ? b[0].toUpperCase() + b.slice(1) : "Card");
const exp = (c: SavedCard) => `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).slice(-2)}`;

export function SavedCards({ cards, value, onChange }: { cards: SavedCard[]; value: string; onChange: (id: string) => void }) {
  return (
    <ChoiceGroup label="Saved cards" value={value} onChange={onChange} className="flex flex-col gap-2">
      {cards.map((c) => (
        <Choice key={c.paymentMethodId} value={c.paymentMethodId} className="min-h-14 w-full rounded-2xl px-4 py-3 text-left">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-semibold">{brandName(c.brand)} {"••••"} {c.last4 ?? ""}</span>
            <span className="text-xs text-[var(--muted-foreground,#6E6558)]">Expires {exp(c)}</span>
            {c.isDefault && <Pill>Default</Pill>}
          </span>
        </Choice>
      ))}
    </ChoiceGroup>
  );
}
