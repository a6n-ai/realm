"use client";

import type { ReactNode, SVGProps } from "react";
import { ArrowLeftRight, Banknote, CreditCard, Wallet, type LucideIcon } from "lucide-react";
import type { SavedCard } from "@foundry/payments/stripe";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Badge } from "@/components/reui/badge";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";

export type PayMethodOption = { id: string; label: string };

// Customers see "Stripe" whatever the config label says, so every place that names the method agrees.
function payMethodTitle(m: PayMethodOption) {
  return m.id === "stripe" ? "Stripe" : m.label;
}

/** A saved card is a choice of its own; it still pays through the "stripe" method. */
export function savedChoice(paymentMethodId: string) {
  return `card:${paymentMethodId}`;
}
export function savedCardOf(choice: string | null) {
  return choice?.startsWith("card:") ? choice.slice(5) : null;
}
/** The card a returning customer pays with unless they pick another. */
export function defaultSavedCard(cards: SavedCard[]): string | null {
  return (cards.find((c) => c.isDefault) ?? cards[0])?.paymentMethodId ?? null;
}

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

// Categorical tile colours (one per payment kind), each with its dark pair.
const TILE = {
  stripe: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  visa: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  mastercard: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  cash: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  etransfer: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  other: "bg-muted text-muted-foreground",
} as const;
const ICON: Record<string, LucideIcon> = { stripe: CreditCard, cash: Banknote, etransfer: ArrowLeftRight };

const brandName = (b: string | null) => (b ? b[0]!.toUpperCase() + b.slice(1) : "Card");
const exp = (c: SavedCard) => `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).slice(-2)}`;

/** ReUI c-radio-group-13 card: icon tile on top, title and details below, radio dot in the corner. */
function Choice({ value, icon, tile, title, badge, children }: { value: string; icon: LucideIcon; tile: string; title: string; badge?: ReactNode; children?: ReactNode }) {
  const id = `pay-${value.replace(":", "-")}`;
  const Icon = icon;
  return (
    <FieldLabel htmlFor={id} className="relative p-0! transition-colors">
      <Field orientation="horizontal">
        <RadioGroupItem value={value} id={id} aria-labelledby={`${id}-title`} aria-describedby={children ? `${id}-desc` : undefined} className="absolute top-3 right-3" />
        <FieldTitle className="flex w-full min-w-0 flex-col items-start gap-2">
          <span aria-hidden className={`grid size-9 place-items-center rounded-lg ${tile}`}>
            <Icon className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col items-start gap-0.5 pr-5">
            <span className="flex flex-wrap items-center gap-1.5">
              <span id={`${id}-title`} className="text-sm font-medium">{title}</span>
              {badge}
            </span>
            {children && <span id={`${id}-desc`} className="text-muted-foreground flex flex-col items-start gap-0.5 text-xs font-normal">{children}</span>}
          </span>
        </FieldTitle>
      </Field>
    </FieldLabel>
  );
}

export function PaymentMethodCards({ methods, savedCards = [], value, onChange, labelledBy, feeNote }: {
  methods: PayMethodOption[];
  savedCards?: SavedCard[];
  /** A method id, or savedChoice(paymentMethodId) for a saved card. */
  value: string;
  onChange: (choice: string) => void;
  labelledBy: string;
  feeNote?: string | null;
}) {
  const cards = methods.some((m) => m.id === "stripe") ? savedCards : [];
  return (
    <RadioGroup value={value} onValueChange={onChange} aria-labelledby={labelledBy} className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
      {cards.map((c) => (
        <Choice
          key={c.paymentMethodId}
          value={savedChoice(c.paymentMethodId)}
          icon={CreditCard}
          tile={c.brand === "visa" ? TILE.visa : c.brand === "mastercard" ? TILE.mastercard : TILE.other}
          title={`${brandName(c.brand)} •••• ${c.last4 ?? "----"}`}
          badge={c.isDefault ? <Badge variant="primary-light">Default</Badge> : undefined}
        >
          <span>Expires {exp(c)}</span>
        </Choice>
      ))}
      {methods.map((m) => (
        <Choice key={m.id} value={m.id} icon={ICON[m.id] ?? Wallet} tile={m.id in TILE ? TILE[m.id as keyof typeof TILE] : TILE.other} title={payMethodTitle(m)}>
          {m.id === "stripe" ? (
            <>
              <span>{cards.length > 0 ? "New card or wallet" : "Card or wallet"}</span>
              <span aria-hidden className="flex items-center gap-1">
                <VisaMark className="size-5 text-[#1A1F71] dark:text-foreground" />
                <MastercardMark className="size-5" />
              </span>
              {feeNote && <span>{feeNote}</span>}
            </>
          ) : undefined}
        </Choice>
      ))}
    </RadioGroup>
  );
}
