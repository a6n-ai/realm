"use client";

import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";
import { formatPhone } from "@foundry/commons";
import { formatMoney } from "@foundry/commons";
import { useState } from "react";
import { displayName } from "@/lib/inquiries/display";
import { isQuickAdd } from "@/lib/inquiries/quick-add";
import { pillClass } from "../new-inquiry-form";
import type { OrderFormInput } from "./order-schema";
import { OrderForm } from "./order/order-form";

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string }[];
  frequencies: { key: string; name: string; weekdays?: string[] | null; savePct?: number }[];
  minTiffinsPerWeek?: number;
  maxTiffinsPerWeek?: number;
  durations: { weeks: number }[];
};

type EnabledSlot = { key: string; label: string };

// The lead's stated interest that OrderForm couldn't auto-match to a catalog
// option arrives as `"<Label>: <value>"` strings from `interestToPrefill`. Split
// them back into label/value; the quoted price is a legacy major-unit number, so
// re-render it through `formatMoney` with the app currency (never a bare ₹).
function interestChip(entry: string, currency: string): { label: string; value: string } {
  const idx = entry.indexOf(": ");
  const label = idx >= 0 ? entry.slice(0, idx) : entry;
  let value = idx >= 0 ? entry.slice(idx + 2) : "";
  if (label === "Quoted price" && value) {
    const n = Number(value);
    if (!Number.isNaN(n)) value = formatMoney(n, currency);
  }
  return { label, value };
}

export function ConvertSheet({
  inquiryId,
  contact,
  catalog,
  enabledSlots,
  prefill,
  unmatched,
  currency,
  existing,
  open,
  onOpenChange,
  hideTrigger,
}: {
  inquiryId: string;
  contact: { fullName: string | null; phone: string | null; whatsappPhone: string | null; email: string | null; leadNumber: number | null };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  prefill?: Partial<OrderFormInput>;
  // Lead interest OrderForm couldn't auto-match — shown as read-only context so the
  // rep sees what was asked for while the matched fields sit prefilled in the form.
  unmatched?: string[];
  // App-setting currency; formats the quoted-price context chip.
  currency: string;
  existing: { publicId: string; fullName: string } | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const chips = (unmatched ?? []).map((u) => interestChip(u, currency));
  // A generated "Lead <n>" goes in blank so OrderForm asks for the real name (convert also rejects it).
  const fullName = isQuickAdd(contact) ? "" : (contact.fullName ?? "");
  const digits = (p: string | null) => (p ?? "").replace(/\D/g, "");
  const askNumber = !!contact.phone && !!contact.whatsappPhone && digits(contact.phone) !== digits(contact.whatsappPhone);
  const [chosenPhone, setChosenPhone] = useState<string | null>(null);
  // OrderForm reads contact once, so it mounts only after the choice (and remounts if it changes).
  const phone = askNumber ? chosenPhone : (contact.phone ?? "");

  const header = (
    <div className="flex flex-col gap-3">
        <section className="bg-muted/30 space-y-2 rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">From the inquiry</p>
          <p className="flex flex-wrap gap-x-3 text-sm font-medium">
            <span>{displayName(contact)}</span>
            {contact.phone ? <span className="text-muted-foreground">{formatPhone(contact.phone)}</span> : null}
          </p>
          {chips.length ? (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span
                  key={c.label}
                  className="bg-background text-foreground inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                >
                  <span className="text-muted-foreground">{c.label}:</span>
                  <span className="tabular-nums">{c.value}</span>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {existing ? (
          <div className="border-warn/40 bg-warn/10 flex items-center gap-2 rounded-md border p-3 text-sm">
            <AlertTriangleIcon className="text-warn size-4 shrink-0" />
            <span>
              Existing customer? {existing.fullName}{" "}
              <Link
                href={`/dashboard/customers/${existing.publicId}`}
                className="font-medium underline underline-offset-2"
              >
                View profile
              </Link>
            </span>
          </div>
        ) : null}
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={hideTrigger ? undefined : <Button>Create order</Button>}
      title={`Order for ${displayName(contact)}`}
      description="Prefilled from the lead's interest — review and create the order."
      contentClassName="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      // Flush: no bottom padding, so the form's sticky Total/Create bar sits on the dialog's edge.
      flush
    >
      <div className="flex min-h-full flex-col gap-4 px-5 [--bar-inset:1.25rem]">
        {askNumber && (
          <section className="flex flex-col gap-2 pt-4">
            <p id="convert-number-label" className="text-sm font-medium">Which number should the customer use?</p>
            <div role="radiogroup" aria-labelledby="convert-number-label" className="flex flex-wrap gap-2">
              {[{ label: "Phone", value: contact.phone! }, { label: "WhatsApp", value: contact.whatsappPhone! }].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={chosenPhone === o.value}
                  onClick={() => setChosenPhone(o.value)}
                  className={pillClass(chosenPhone === o.value)}
                >
                  {o.label} {formatPhone(o.value)}
                </button>
              ))}
            </div>
          </section>
        )}
        {phone !== null && (
        <OrderForm
          key={phone}
          inquiryId={inquiryId}
          contact={{ fullName, phone, email: contact.email ?? "" }}
          catalog={catalog}
          enabledSlots={enabledSlots}
          prefill={prefill}
          layout="split"
          header={header}
          onCreated={() => onOpenChange?.(false)}
        />
        )}
      </div>
    </ResponsiveDialog>
  );
}
