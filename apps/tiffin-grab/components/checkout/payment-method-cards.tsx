"use client";

import type { ReactNode, SVGProps } from "react";
import { ArrowLeftRight, Banknote, CreditCard, Wallet, type LucideIcon } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";

export type PayMethodOption = { id: string; label: string };

// Customers see "Stripe" whatever the config label says, so every place that names the method agrees.
function payMethodTitle(m: PayMethodOption) {
  return m.id === "stripe" ? "Stripe" : m.label.replace(/-/g, "\u2011");
}

// Simplified marks from the ReUI payment-method radio cards (c-radio-group-13).
const VisaMark = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 32 24" fill="none" {...props}>
    <text x="16" y="17" textAnchor="middle" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="13" fontWeight="900" fontStyle="italic" letterSpacing="-0.5">VISA</text>
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

const SUBTITLE: Record<string, string> = { stripe: "Card or wallet", cash: "Pay the driver", etransfer: "Send to our email" };

/** One structure for every card (so all are the same height): icon tile and side marks on top, title over subtitle below. */
function Choice({ value, icon, tile, title, subtitle, aside }: { value: string; icon: LucideIcon; tile: string; title: string; subtitle?: string; aside?: ReactNode }) {
  const id = `pay-${value.replace(":", "-")}`;
  const Icon = icon;
  return (
    <FieldLabel htmlFor={id} className="relative h-full p-0! transition-colors">
      <Field orientation="horizontal" className="h-full">
        <RadioGroupItem value={value} id={id} aria-labelledby={`${id}-title`} aria-describedby={subtitle ? `${id}-desc` : undefined} className="absolute top-3 right-3" />
        <FieldTitle className="flex w-full min-w-0 flex-col items-start justify-start gap-2">
          <span className="flex h-9 w-full items-center justify-between gap-2 pr-7">
            <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-lg ${tile}`}>
              <Icon className="size-5" />
            </span>
            {aside && <span aria-hidden className="flex items-center gap-1">{aside}</span>}
          </span>
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <span id={`${id}-title`} className="line-clamp-2 text-sm font-medium">{title}</span>
            <span id={`${id}-desc`} className="text-muted-foreground min-h-4 text-xs font-normal">{subtitle}</span>
          </span>
        </FieldTitle>
      </Field>
    </FieldLabel>
  );
}

// Equal tracks and a column per option (up to 3), so every card has the same size at every width.
const COLUMNS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

export function PaymentMethodCards({ methods, value, onChange, labelledBy, feeNote }: {
  methods: PayMethodOption[];
  value: string;
  onChange: (choice: string) => void;
  labelledBy: string;
  feeNote?: string | null;
}) {
  const hasStripe = methods.some((m) => m.id === "stripe");
  return (
    <div className="flex flex-col gap-3">
      <RadioGroup value={value} onValueChange={onChange} aria-labelledby={labelledBy} className={`grid items-stretch gap-3 ${COLUMNS[methods.length] ?? "grid-cols-2 sm:grid-cols-3"}`}>
        {methods.map((m) => (
          <Choice
            key={m.id}
            value={m.id}
            icon={ICON[m.id] ?? Wallet}
            tile={m.id in TILE ? TILE[m.id as keyof typeof TILE] : TILE.other}
            title={payMethodTitle(m)}
            subtitle={SUBTITLE[m.id]}
            aside={m.id === "stripe" ? <><VisaMark className="h-5 w-7 text-[#1A1F71] dark:text-foreground" /><MastercardMark className="size-5" /></> : undefined}
          />
        ))}
      </RadioGroup>
      {hasStripe && feeNote && <p className="text-muted-foreground text-xs">{feeNote}. Debit cards have no fee.</p>}
    </div>
  );
}
