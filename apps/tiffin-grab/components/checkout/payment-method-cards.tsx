"use client";

import { useId, type ReactNode, type SVGProps } from "react";
import { Banknote, Check, Wallet, type LucideIcon } from "lucide-react";
import { IconTile, type IconTint } from "@/components/customer/kit";
import { cn, FONT } from "@/components/customer/kit/cn";

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

// Stripe's own "S" (Simple Icons path) on its purple, Interac's yellow with a heavy "e" (no official mark is
// shipped here; swap in their brand-kit SVG if one is added); anything else a Settings tile.
const STRIPE_S = "M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z";
const BRAND_TILE = "grid size-10 shrink-0 place-items-center rounded-xl";
function MethodTile({ id }: { id: string }) {
  if (id === "stripe") {
    return (
      <span aria-hidden className={`${BRAND_TILE} bg-[#635BFF] text-white`}>
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><path d={STRIPE_S} /></svg>
      </span>
    );
  }
  if (id === "etransfer") {
    return <span aria-hidden className={`${BRAND_TILE} bg-[#FFB81C] text-[24px] leading-none font-black text-black italic`}>e</span>;
  }
  const look = LOOK[id] ?? OTHER;
  return <IconTile tint={look.tint} size="lg"><look.icon /></IconTile>;
}
const LOOK: Record<string, { icon: LucideIcon; tint: IconTint }> = { cash: { icon: Banknote, tint: "green" } };
const OTHER = { icon: Wallet, tint: "gray" as IconTint };

const SUBTITLE: Record<string, string> = { stripe: "Card or wallet", cash: "Pay the driver", etransfer: "Send to our email" };

/** One card: tile and marks on top, title over subtitle, the check in the corner. The wizard's option-card look
 *  (ring + wash when picked, flat surface otherwise) over a native radio, so arrow keys and the name still work. */
function Choice({ name, value, checked, onChange, title, subtitle, aside, wide }: {
  name: string; value: string; checked: boolean; onChange: (v: string) => void;
  title: string; subtitle?: string; aside?: ReactNode; wide?: boolean;
}) {
  const id = `pay-${value.replace(":", "-")}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "relative flex min-h-28 cursor-pointer flex-col justify-between gap-3 rounded-[20px] p-4 [-webkit-tap-highlight-color:transparent] [touch-action:manipulation] transition-[transform,background-color,box-shadow] duration-100 active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--primary)]",
        checked ? "bg-[color-mix(in_oklch,var(--primary)_10%,transparent)] ring-2 ring-[var(--primary)]" : "c-surface bg-[var(--card)] hover:bg-[var(--muted)]",
        wide && "col-span-2 sm:col-span-1",
      )}
    >
      <input type="radio" id={id} name={name} value={value} checked={checked} onChange={() => onChange(value)} aria-labelledby={`${id}-title`} aria-describedby={subtitle ? `${id}-desc` : undefined} className="sr-only" />
      <span className="flex items-center gap-2 pr-8">
        <MethodTile id={value} />
        {aside && <span aria-hidden className="flex items-center gap-1">{aside}</span>}
      </span>
      <span aria-hidden className={cn("absolute top-3 right-3 grid size-6 place-items-center rounded-full transition-colors", checked ? "bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)]")}>
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span id={`${id}-title`} className="text-[15px] leading-snug font-semibold text-balance">{title}</span>
        {subtitle && <span id={`${id}-desc`} className="text-[13px] text-[var(--muted-foreground)]">{subtitle}</span>}
      </span>
    </label>
  );
}

export function PaymentMethodCards({ methods, value, onChange, labelledBy, feeNote }: {
  methods: PayMethodOption[];
  value: string;
  onChange: (choice: string) => void;
  labelledBy: string;
  feeNote?: string | null;
}) {
  const name = useId();
  const hasStripe = methods.some((m) => m.id === "stripe");
  return (
    <div className={cn(FONT, "flex flex-col gap-2")}>
      <div role="radiogroup" aria-labelledby={labelledBy} className={cn("grid gap-3", methods.length === 1 ? "grid-cols-1" : "grid-cols-2", methods.length >= 3 && "sm:grid-cols-3")}>
        {methods.map((m, i) => {
          return (
            <Choice
              key={m.id}
              name={name}
              value={m.id}
              checked={value === m.id}
              onChange={onChange}
              title={payMethodTitle(m)}
              subtitle={SUBTITLE[m.id]}
              aside={m.id === "stripe" ? <><VisaMark className="h-5 w-7 text-[#1A1F71] dark:text-foreground" /><MastercardMark className="size-5" /></> : undefined}
              // An odd last card takes the full row on phones, so no card sits alone at half width.
              wide={methods.length > 1 && methods.length % 2 === 1 && i === methods.length - 1}
            />
          );
        })}
      </div>
      {hasStripe && feeNote && <p className="px-4 text-[13px] text-[var(--muted-foreground)]">{feeNote}. Debit cards have no fee.</p>}
    </div>
  );
}
