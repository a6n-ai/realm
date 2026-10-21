"use client";

import type { ReactNode, SVGProps } from "react";
import { ArrowLeftRight, Banknote, CreditCard, Nfc, Wallet } from "lucide-react";
import type { SavedCard } from "@foundry/payments/stripe";
import { RadioGroup, RadioGroupItem } from "@foundry/ui/radio-group";
import { Badge } from "@/components/reui/badge";
import { Card, CardContent } from "@/components/ui/card";

export type PayMethodOption = { id: string; label: string };

// Customers see "Stripe" whatever the config label says, so every place that names the method agrees.
export function payMethodTitle(m: PayMethodOption) {
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

/* Card art: decorative backgrounds only (aria-hidden), from our tokens. Its small text is illustration, not copy. */

const Chip = () => <span className="bg-primary-foreground/20 ring-primary-foreground/25 block h-5 w-7 rounded-[5px] ring-1" />;
const MarkTile = ({ children }: { children: ReactNode }) => <span className="bg-background/90 grid h-5 w-8 place-items-center rounded-[4px]">{children}</span>;

function StripeArt() {
  return (
    <div className="from-primary via-primary/85 to-primary/55 text-primary-foreground absolute inset-0 bg-linear-to-br p-4">
      <div className="flex items-center gap-2">
        <Chip />
        <Nfc className="size-4 opacity-70" />
      </div>
      <span className="absolute top-3 right-12 text-lg font-bold tracking-tight opacity-90">stripe</span>
      <span className="absolute top-11 right-3 flex items-center gap-1">
        <MarkTile><VisaMark className="size-5 text-[#1A1F71]" /></MarkTile>
        <MarkTile><MastercardMark className="size-5" /></MarkTile>
        <span className="bg-foreground text-background grid h-5 place-items-center rounded-[4px] px-1 text-[9px] font-semibold">Apple Pay</span>
        <span className="bg-background/90 text-foreground grid h-5 place-items-center rounded-[4px] px-1 text-[9px] font-semibold">G Pay</span>
      </span>
    </div>
  );
}

function SavedCardArt({ brand }: { brand: string | null }) {
  return (
    <div className="from-foreground via-foreground/85 to-foreground/65 text-background absolute inset-0 bg-linear-to-br p-4">
      <div className="flex items-center gap-2">
        <Chip />
        <Nfc className="size-4 opacity-70" />
      </div>
      <span className="bg-background/90 absolute top-3 right-12 grid h-6 w-10 place-items-center rounded-[5px]">
        {brand === "visa" ? <VisaMark className="size-6 text-[#1A1F71]" />
          : brand === "mastercard" ? <MastercardMark className="size-6" />
          : <CreditCard className="text-foreground size-4" />}
      </span>
    </div>
  );
}

function PlainArt({ icon }: { icon: ReactNode }) {
  return (
    <div className="from-muted to-background text-muted-foreground absolute inset-0 bg-linear-to-br">
      <span className="absolute top-3 right-10 -rotate-6 opacity-60 [&>svg]:size-14">{icon}</span>
    </div>
  );
}

function artFor(m: PayMethodOption) {
  if (m.id === "stripe") return <StripeArt />;
  if (m.id === "cash") return <PlainArt icon={<Banknote strokeWidth={1.25} />} />;
  if (m.id === "etransfer") return <PlainArt icon={<ArrowLeftRight strokeWidth={1.25} />} />;
  return <PlainArt icon={<Wallet strokeWidth={1.25} />} />;
}

const brandName = (b: string | null) => (b ? b[0]!.toUpperCase() + b.slice(1) : "Card");
const exp = (c: SavedCard) => `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).slice(-2)}`;

/** ReUI c-card-10: the art fills the card and fades top and bottom; the radio and text sit on top of it. */
function OptionCard({ value, art, title, badge, children }: { value: string; art: ReactNode; title: string; badge?: ReactNode; children?: ReactNode }) {
  const id = `pay-${value.replace(":", "-")}`;
  return (
    <label htmlFor={id} className="group/opt block cursor-pointer">
      <Card className="has-[[data-state=checked]]:ring-primary p-0 transition-colors has-[[data-state=checked]]:ring-2">
        <CardContent className="p-0">
          <div className="relative flex h-36 w-full flex-col justify-end overflow-hidden">
            <div aria-hidden className="absolute inset-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/opt:scale-105 motion-reduce:transition-none motion-reduce:group-hover/opt:scale-100">{art}</div>
            <div aria-hidden className="from-card/60 absolute inset-x-0 top-0 h-1/3 bg-linear-to-b to-transparent" />
            <div aria-hidden className="from-card via-card/90 absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t to-transparent" />
            <RadioGroupItem value={value} id={id} aria-labelledby={`${id}-title`} aria-describedby={children ? `${id}-desc` : undefined} className="bg-background absolute top-3 right-3" />
            <div className="relative flex flex-col gap-0.5 p-3">
              <span className="flex items-center gap-2">
                <span id={`${id}-title`} className="text-sm font-medium">{title}</span>
                {badge}
              </span>
              {children && <span id={`${id}-desc`} className="text-muted-foreground flex flex-col gap-0.5 text-xs">{children}</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    </label>
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
    <RadioGroup value={value} onValueChange={onChange} aria-labelledby={labelledBy} className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
      {cards.map((c) => (
        <OptionCard
          key={c.paymentMethodId}
          value={savedChoice(c.paymentMethodId)}
          art={<SavedCardArt brand={c.brand} />}
          title={`${brandName(c.brand)} •••• ${c.last4 ?? "----"}`}
          badge={c.isDefault ? <Badge variant="primary-light">Default</Badge> : undefined}
        >
          <span>Expires {exp(c)}</span>
        </OptionCard>
      ))}
      {methods.map((m) => (
        <OptionCard key={m.id} value={m.id} art={artFor(m)} title={payMethodTitle(m)}>
          {m.id === "stripe" ? (
            <>
              <span>{cards.length > 0 ? "A new card, Apple Pay, Google Pay" : "Card, Apple Pay, Google Pay"}</span>
              {feeNote && <span>{feeNote}</span>}
            </>
          ) : undefined}
        </OptionCard>
      ))}
    </RadioGroup>
  );
}
