"use client";

import type { SavedCard } from "@foundry/payments/stripe";
import { Badge } from "@/components/reui/badge";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";

const brandName = (b: string | null) => (b ? b[0].toUpperCase() + b.slice(1) : "Card");
const exp = (c: SavedCard) => `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).slice(-2)}`;

export function SavedCards({ cards, value, onChange }: { cards: SavedCard[]; value: string; onChange: (id: string) => void }) {
  return (
    <RadioGroup value={value} onValueChange={onChange} aria-label="Saved cards" className="flex flex-col gap-3">
      {cards.map((c) => (
        <FieldLabel key={c.paymentMethodId} htmlFor={`card-${c.paymentMethodId}`} className="relative p-0! transition-colors">
          <Field orientation="horizontal">
            <RadioGroupItem value={c.paymentMethodId} id={`card-${c.paymentMethodId}`} aria-labelledby={`card-${c.paymentMethodId}-title`} className="absolute top-3 right-3 data-[state=checked]:border-primary data-[state=checked]:bg-primary" />
            <FieldTitle className="flex flex-col items-start gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span id={`card-${c.paymentMethodId}-title`}>{brandName(c.brand)} ending in {c.last4 ?? "----"}</span>
                {c.isDefault && <Badge variant="primary-light">Default</Badge>}
              </span>
              <span className="text-xs text-muted-foreground">Expires {exp(c)}</span>
            </FieldTitle>
          </Field>
        </FieldLabel>
      ))}
    </RadioGroup>
  );
}
