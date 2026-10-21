"use client";

import type { SVGProps } from "react";
import { Banknote, CreditCard, Send, Wallet, type LucideIcon } from "lucide-react";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";

export type PayMethodOption = { id: string; label: string };

// Customers see "Stripe" whatever the config label says, so the option and the Review row agree.
export function payMethodTitle(m: PayMethodOption) {
  return m.id === "stripe" ? "Stripe" : m.label;
}

const ICONS: Record<string, LucideIcon> = { stripe: CreditCard, cash: Banknote, etransfer: Send };

// Simplified marks from the ReUI payment-method radio cards (c-radio-group-13).
const VisaMark = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <path
      d="M9.5 8L7 16H5L3 8H5L6.25 13.5L8 8H9.5ZM11 8H12.5V16H11V8ZM16.5 10.5C16.5 9.7 15.8 9.2 14.8 9.2C14 9.2 13.3 9.5 12.8 10L12 9C12.8 8.3 13.8 8 15 8C16.8 8 18 9 18 10.5C18 13.5 14 12.5 14 14.2C14 14.8 14.5 15 15.2 15C16 15 16.7 14.7 17.2 14.2L18 15.2C17.2 15.9 16.2 16.2 15 16.2C13.5 16.2 12.5 15.3 12.5 14C12.5 11.2 16.5 12 16.5 10.5ZM21 16H19.5L22 8H23.5L21 16Z"
      fill="currentColor"
    />
  </svg>
);
const MastercardMark = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <circle cx="9" cy="12" r="5" fill="#EB001B" />
    <circle cx="15" cy="12" r="5" fill="#F79E1B" />
    <path d="M12 15.5C13.2 14.5 14 13.3 14 12C14 10.7 13.2 9.5 12 8.5C10.8 9.5 10 10.7 10 12C10 13.3 10.8 14.5 12 15.5Z" fill="#FF5F00" />
  </svg>
);

// Until foundry main has the radio data-state fix (branch fix/ui-radio-state): Radix sets data-state, not data-checked.
const CHECKED_DOT = "data-[state=checked]:border-primary data-[state=checked]:bg-primary";

export function PaymentMethodCards({ methods, value, onChange, labelledBy, feeNote }: {
  methods: PayMethodOption[];
  value: string;
  onChange: (id: string) => void;
  labelledBy: string;
  feeNote?: string | null;
}) {
  return (
    <RadioGroup value={value} onValueChange={onChange} aria-labelledby={labelledBy} className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
      {methods.map((m) => {
        const Icon = ICONS[m.id] ?? Wallet;
        const id = `pay-${m.id}`;
        const stripe = m.id === "stripe";
        return (
          <FieldLabel key={m.id} htmlFor={id} className="relative p-0! transition-colors">
            <Field orientation="horizontal">
              <RadioGroupItem value={m.id} id={id} aria-labelledby={`${id}-title`} aria-describedby={stripe ? `${id}-desc` : undefined} className={`absolute top-3 right-3 ${CHECKED_DOT}`} />
              <FieldTitle className="flex w-full flex-row items-center gap-3 pr-8 sm:flex-col sm:items-start sm:pr-0">
                <span aria-hidden className={`bg-background border-border text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors group-has-[[data-state=checked]]/field-label:border-primary/40 group-has-[[data-state=checked]]/field-label:text-primary`}>
                  <Icon className={`size-5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-has-[[data-state=checked]]/field-label:scale-110`} />
                </span>
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span id={`${id}-title`} className="text-sm font-medium">{payMethodTitle(m)}</span>
                  {stripe && (
                    <span id={`${id}-desc`} className="text-muted-foreground flex flex-col items-start gap-1 text-xs font-normal">
                      <span className="flex flex-wrap items-center gap-1.5">
                        Card, Apple Pay, Google Pay
                        <VisaMark aria-hidden className="size-5 text-[#1A1F71] dark:text-foreground" />
                        <MastercardMark aria-hidden className="size-5" />
                      </span>
                      {feeNote && <span>{feeNote}</span>}
                    </span>
                  )}
                </span>
              </FieldTitle>
            </Field>
          </FieldLabel>
        );
      })}
    </RadioGroup>
  );
}
