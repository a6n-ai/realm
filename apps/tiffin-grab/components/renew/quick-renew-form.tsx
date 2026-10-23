"use client";

import { useState } from "react";
import Link from "next/link";
import { formatAddress } from "@foundry/address/ui";
import { BottomBar, Button, Card, Choice, ChoiceGroup, Notice, Pill, Sheet, Skeleton } from "@/components/customer/kit";
import { buttonClass } from "@/components/customer/kit/button-class";
import { DateField } from "@/components/customer/date-field";
import { CheckoutAddressPicker } from "@/components/checkout/checkout-address-picker";
import { AddonsPanel } from "@/components/wizard/addons-panel";
import type { WizardSelections } from "@/components/wizard/selections";
import { dropOffCatalog } from "@/lib/catalog/drop-off";
import { formatDateOnly } from "@/lib/format/datetime";
import { QuickRenewFormAdmin } from "./quick-renew-form-admin";
import { useQuickRenew } from "./use-quick-renew";
import type { QuickRenewData } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export type QuickRenewFormProps = QuickRenewData & {
  variant: "customer" | "admin";
  submitLabel: string;
  /** Returns an error message, or null when the order was placed. */
  onSubmit: (s: WizardSelections, addressPublicId: string | null) => Promise<string | null>;
  /** Customer only: back to the full stepper to change meal or days. */
  changePlanHref?: string;
  /** Customer only: hands the current picks to the page, which sends the customer to checkout to type a new address. */
  onUseNewAddress?: (s: WizardSelections) => void;
};

/** One-screen renewal: everything prefilled, one button to pay. `variant` picks the shell over one shared state hook. */
export function QuickRenewForm({ variant, changePlanHref, onUseNewAddress, ...data }: QuickRenewFormProps) {
  return variant === "admin" ? <QuickRenewFormAdmin {...data} /> : <CustomerShell {...data} changePlanHref={changePlanHref} onUseNewAddress={onUseNewAddress} />;
}

function CustomerShell({ changePlanHref, onUseNewAddress, ...data }: QuickRenewData & Pick<QuickRenewFormProps, "submitLabel" | "onSubmit" | "changePlanHref" | "onUseNewAddress">) {
  const q = useQuickRenew(data);
  const { sel, set, catalog, price } = q;
  const [pickingAddress, setPickingAddress] = useState(false);
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [addonsSheet, setAddonsSheet] = useState(false);
  const color = data.tagColor && HEX.test(data.tagColor) ? data.tagColor : null;
  const dropOff = dropOffCatalog(catalog.deliveryCharges, catalog.waivers);
  const diet = data.tagLabel || q.plan?.name;

  const openAddons = () => {
    const phone = typeof matchMedia === "function" && !matchMedia("(min-width: 640px)").matches;
    if (phone) setAddonsSheet(true);
    else setAddonsOpen((o) => !o);
  };

  const total = price.loading ? (
    <Skeleton className="h-7 w-24" />
  ) : price.error ? (
    <span role="alert" className="c-caption flex items-center gap-2">
      {price.error}
      <Button variant="quiet" pill onClick={q.retry}>Retry</Button>
    </span>
  ) : (
    <span className="c-stat" aria-label={`Total $${price.result!.total.toFixed(2)}`}>${price.result!.total.toFixed(2)}</span>
  );

  return (
    <div className="flex flex-col gap-6 pb-40 sm:pb-6">
      <Card aria-label="Your plan" data-testid="plan-card" className="px-4 py-4" style={color ? { borderLeft: `4px solid ${color}` } : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="c-h2">{q.meal?.name ?? "Your plan"}</p>
          {diet && <Pill tone="soft" size="sm">{diet}</Pill>}
        </div>
        <p className="c-caption mt-1">{(sel.eatingDays ?? []).map((d) => DAY_LABEL[d] ?? d).join(", ")}</p>
        {changePlanHref && (
          <Link href={changePlanHref} className={buttonClass({ variant: "quiet", pill: true, className: "mt-3" })}>Change meal or days</Link>
        )}
      </Card>

      <div className="flex flex-col gap-1.5">
        <DateField id="renew-start-date" label="Start date" value={sel.startDate} onChange={q.onStartDate} today={q.minDate} minDate={q.minDate} allowedDays={q.allowed} closedDates={data.holidayDates} />
        {q.dateError ? (
          <p role="alert" className="c-caption">{q.dateError}</p>
        ) : q.keptDefault ? (
          <p className="c-caption">Starts right after your current plan ends</p>
        ) : null}
        {sel.startDate !== q.earliest && (
          <Button variant="quiet" pill className="self-start" onClick={() => { set({ startDate: q.earliest }); q.setDateError(null); }}>
            Use earliest, {formatDateOnly(q.earliest, { mode: "short" })}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <p className="c-label">Weeks</p>
        <ChoiceGroup label="Weeks" className="grid grid-cols-3 gap-3 sm:grid-cols-5" value={String(sel.durationWeeks)} onChange={(v) => set({ durationWeeks: Number(v) })}>
          {[...catalog.durations].sort((a, b) => b.weeks - a.weeks).map((d) => (
            <Choice key={d.weeks} value={String(d.weeks)} className="min-h-14 p-3 text-sm font-semibold">
              <span className="c-h2">{d.weeks}wk</span>
            </Choice>
          ))}
        </ChoiceGroup>
      </div>

      {q.addons.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={addonsOpen}
            onClick={openAddons}
            className="c-body flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 text-left font-semibold transition-colors hover:bg-[var(--muted)]"
          >
            Add to every tiffin?
            <span className="c-caption font-normal">{q.addonCount > 0 ? `${q.addonCount} added` : "Optional"}</span>
          </button>
          {addonsOpen && <AddonsPanel addons={q.addons} categoryLabels={catalog.categoryLabels} selections={sel} set={set} />}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="c-label">Deliver to</p>
          {data.savedAddresses.length > 1 && (
            <Button variant="quiet" pill onClick={() => setPickingAddress((o) => !o)}>{pickingAddress ? "Done" : "Change"}</Button>
          )}
        </div>
        {pickingAddress ? (
          <CheckoutAddressPicker
            addresses={data.savedAddresses}
            value={q.addressId}
            onPick={(a) => { q.setAddressId(a?.publicId ?? null); setPickingAddress(false); }}
            dropOff={dropOff}
            dropOffs={data.addressDropOffs}
          />
        ) : (
          <p className="c-body">
            {q.address ? <><span className="font-semibold">{q.address.label}</span> <span className="c-caption">{formatAddress(q.address)}</span></> : <span className="c-caption">No saved address yet.</span>}
          </p>
        )}
        {onUseNewAddress && (
          <Button variant="quiet" pill className="self-start" onClick={() => onUseNewAddress(sel)}>Use a different address</Button>
        )}
      </div>

      {q.submitError && <Notice tone="error">{q.submitError}</Notice>}

      <BottomBar alignEnd className="sm:sticky sm:px-0">
        <div className="flex flex-1 items-center justify-between gap-3 sm:flex-none sm:gap-6">
          {total}
          <Button variant="primary" size="lg" className="flex-1 sm:flex-none sm:px-8" disabled={!q.canSubmit} pending={q.submitting} onClick={q.submit}>{data.submitLabel}</Button>
        </div>
      </BottomBar>

      <Sheet
        open={addonsSheet}
        onClose={() => setAddonsSheet(false)}
        title="Add to every tiffin?"
        footer={<Button variant="primary" size="lg" className="w-full" onClick={() => setAddonsSheet(false)}>{q.addonCount > 0 ? "Done" : "Skip extras"}</Button>}
      >
        <AddonsPanel bare addons={q.addons} categoryLabels={catalog.categoryLabels} selections={sel} set={set} className="pb-2" />
      </Sheet>
    </div>
  );
}
