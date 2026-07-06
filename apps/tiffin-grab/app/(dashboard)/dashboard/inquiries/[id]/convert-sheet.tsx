"use client";

import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { ResponsiveDialog } from "@realm/design-system";
import { formatMoney } from "@/lib/format/money";
import type { ZoneLike } from "@/lib/catalog/postal";
import type { OrderFormInput } from "./order-schema";
import { OrderForm } from "./order/order-form";

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string }[];
  frequencies: { key: string; name: string }[];
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
    if (!Number.isNaN(n)) value = formatMoney(Math.round(n * 100), currency);
  }
  return { label, value };
}

export function ConvertSheet({
  inquiryId,
  contact,
  catalog,
  enabledSlots,
  zones,
  prefill,
  unmatched,
  currency,
  existing,
  open,
  onOpenChange,
  hideTrigger,
}: {
  inquiryId: string;
  contact: { fullName: string; phone: string; email: string };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  zones: ZoneLike[];
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

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={hideTrigger ? undefined : <Button>Create order</Button>}
      title={`Order for ${contact.fullName}`}
      description="Prefilled from the lead's interest — review and create the order."
      contentClassName="flex max-h-[85vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <section className="bg-muted/30 space-y-3 rounded-xl border p-4">
          <p className="text-muted-foreground/80 text-[0.7rem] font-semibold tracking-[0.08em] uppercase">
            From the inquiry
          </p>
          <p className="text-sm font-medium">
            {contact.fullName}
            <span className="text-muted-foreground"> · {contact.phone}</span>
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

        <OrderForm
          inquiryId={inquiryId}
          contact={contact}
          catalog={catalog}
          enabledSlots={enabledSlots}
          zones={zones}
          prefill={prefill}
        />
      </div>
    </ResponsiveDialog>
  );
}
