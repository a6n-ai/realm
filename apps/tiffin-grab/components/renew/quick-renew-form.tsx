"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { formatAddress } from "@foundry/address/ui";
import { Button as AdminButton } from "@foundry/ui/button";
import { Skeleton as AdminSkeleton } from "@foundry/ui/skeleton";
import { reprice } from "@/app/(public)/subscribe/actions";
import { BottomBar, Button, Choice, ChoiceGroup, Notice, Pill, Sheet, Skeleton } from "@/components/customer/kit";
import { DateField } from "@/components/customer/date-field";
import { CheckoutAddressPicker } from "@/components/checkout/checkout-address-picker";
import { AddonsPanel } from "@/components/wizard/addons-panel";
import { offeredAddons, type WizardSelections } from "@/components/wizard/selections";
import { formatDateOnly } from "@/lib/format/datetime";
import { appToday, firstStartOnOrAfter } from "@/lib/services/start-date";
import type { PricingResult } from "@/lib/pricing";
import type { QuickRenewData } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;
const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

type Props = QuickRenewData & {
  variant: "customer" | "admin";
  submitLabel: string;
  /** Returns an error message, or null when the order was placed. */
  onSubmit: (s: WizardSelections, addressPublicId: string | null) => Promise<string | null>;
  /** Customer only: back to the full stepper to change meal or days. */
  changePlanHref?: string;
  /** The plan's admin tag (not in the catalog snapshot); the page passes it from the source order. */
  tagColor?: string | null;
  tagLabel?: string | null;
};

/**
 * One-screen renewal: everything prefilled, one button to pay. Customer and admin share this
 * state; `variant` only swaps the shell (kit bar + buttons vs a plain sticky footer).
 */
export function QuickRenewForm({
  catalog, initial, minStartDate, lastTiffin, holidayDates, savedAddresses, addressDropOffs, defaultAddressPublicId,
  variant, submitLabel, onSubmit, changePlanHref, tagColor, tagLabel,
}: Props) {
  const admin = variant === "admin";
  const [sel, setSel] = useState<WizardSelections>(initial);
  const set = (patch: Partial<WizardSelections>) => setSel((s) => ({ ...s, ...patch }));
  const [addressId, setAddressId] = useState<string | null>(defaultAddressPublicId);
  const [pickingAddress, setPickingAddress] = useState(false);
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [addonsSheet, setAddonsSheet] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [price, setPrice] = useState<{ result: PricingResult | null; error: string | null; loading: boolean }>({ result: null, error: null, loading: true });
  const [retry, setRetry] = useState(0);

  const plan = catalog.plans.find((p) => p.key === sel.planKey);
  const meal = catalog.mealSizes.find((m) => m.publicId === sel.mealSizeId);
  const allowed = plan?.allowedStartDays ?? ["mon", "tue", "wed", "thu", "fri"];
  const today = appToday(catalog.timezone, catalog.cutoffHour);
  const tomorrow = nextWeekday(today).toISOString().slice(0, 10);
  const minDate = minStartDate && minStartDate > tomorrow ? minStartDate : tomorrow;
  const closed = useMemo(() => new Set(holidayDates), [holidayDates]);
  const earliest = firstStartOnOrAfter(minDate, allowed, closed);
  const address = savedAddresses.find((a) => a.publicId === addressId) ?? null;
  const addons = offeredAddons(catalog, sel);
  const addonCount = (sel.addonSelections ?? []).reduce((n, a) => n + a.qty, 0);
  const color = tagColor && HEX.test(tagColor) ? tagColor : null;

  useEffect(() => {
    let active = true;
    setPrice((p) => ({ ...p, loading: true, error: null }));
    reprice(sel, undefined, sel.planKey ?? undefined, undefined, undefined, address?.postalCode, address?.addressLine, address?.city)
      .then((r) => { if (active) setPrice({ result: "error" in r ? null : r.pricing, error: "error" in r ? r.error : null, loading: false }); })
      .catch(() => { if (active) setPrice({ result: null, error: "Couldn't load the price.", loading: false }); });
    return () => { active = false; };
  }, [sel, address, retry]);

  const onStartDate = (v: string) => {
    if (!v) return;
    if (v < minDate) return setDateError(`Earliest available start date is ${formatDateOnly(minDate, { mode: "short" })}`);
    if (closed.has(v)) return setDateError("We are closed that day. Pick another start date");
    if (!allowed.includes(weekdayKey(parseIsoDateUtc(v)))) return setDateError("That day isn't a delivery day for this plan");
    setDateError(null);
    set({ startDate: v });
  };

  const openAddons = () => {
    const phone = typeof matchMedia === "function" && !matchMedia("(min-width: 640px)").matches;
    if (phone && !admin) setAddonsSheet(true);
    else setAddonsOpen((o) => !o);
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      setSubmitError(await onSubmit(sel, addressId));
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!sel.startDate && !price.loading && !price.error && !!price.result && !submitting;
  const keptDefault = sel.startDate === initial.startDate && !!lastTiffin;
  const muted = "text-[var(--muted-foreground,#6E6558)]";
  const label = "text-muted-foreground text-[13px] font-semibold tracking-[0.02em]";

  const totalBlock = price.loading ? (
    admin ? <AdminSkeleton className="h-6 w-24" /> : <Skeleton className="h-7 w-24" />
  ) : price.error ? (
    <span role="alert" className="flex items-center gap-2 text-sm text-destructive">
      {price.error}
      {admin
        ? <AdminButton size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>Retry</AdminButton>
        : <Button size="md" variant="quiet" pill onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
    </span>
  ) : (
    <span className="text-[22px] leading-none font-bold tabular-nums" aria-label={`Total $${price.result!.total.toFixed(2)}`}>${price.result!.total.toFixed(2)}</span>
  );

  const submitButton = admin
    ? <AdminButton disabled={!canSubmit} onClick={submit}>{submitLabel}</AdminButton>
    : <Button variant="primary" size="lg" className="flex-1 sm:flex-none sm:px-8" disabled={!canSubmit} pending={submitting} onClick={submit}>{submitLabel}</Button>;

  return (
    <div className={admin ? "flex flex-col gap-6" : "flex flex-col gap-6 pb-40 sm:pb-6"}>
      <section
        aria-label="Your plan"
        data-testid="plan-card"
        className="rounded-[20px] border-[1.5px] border-[var(--border)] bg-[var(--card,#fff)] px-4 py-3.5"
        style={color ? { borderLeft: `4px solid ${color}` } : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[22px] leading-tight font-bold tracking-[-0.02em]">{meal?.name ?? "Your plan"}</p>
          {(tagLabel || plan?.name) && <Pill tone="soft" size="sm">{tagLabel || plan?.name}</Pill>}
        </div>
        <p className={`mt-1.5 text-[15px] ${muted}`}>{(sel.eatingDays ?? []).map((d) => DAY_LABEL[d] ?? d).join(", ")}</p>
        {changePlanHref && !admin && (
          <Link href={changePlanHref} className="mt-2 inline-block text-[15px] font-semibold text-[var(--primary)] underline-offset-2 hover:underline">Change meal or days</Link>
        )}
      </section>

      <div>
        <DateField id="renew-start-date" label="Start date" value={sel.startDate} onChange={onStartDate} today={minDate} minDate={minDate} allowedDays={allowed} closedDates={holidayDates} />
        {dateError
          ? <p className="mt-1 text-xs text-destructive">{dateError}</p>
          : keptDefault && <p className={`mt-1 text-xs ${muted}`}>Starts right after your current plan ends</p>}
        {sel.startDate !== earliest && !dateError && (
          <button type="button" className="mt-1 text-xs font-semibold underline underline-offset-2" onClick={() => { set({ startDate: earliest }); setDateError(null); }}>
            Use earliest, {formatDateOnly(earliest, { mode: "short" })}
          </button>
        )}
      </div>

      <div>
        <p className={label}>Weeks</p>
        <ChoiceGroup label="Weeks" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" value={String(sel.durationWeeks)} onChange={(v) => set({ durationWeeks: Number(v) })}>
          {[...catalog.durations].sort((a, b) => b.weeks - a.weeks).map((d) => (
            <Choice key={d.weeks} value={String(d.weeks)} className="min-h-[56px] p-3 text-sm font-semibold">
              <span className="text-[20px] leading-none font-bold tracking-[-0.03em]">{d.weeks}wk</span>
            </Choice>
          ))}
        </ChoiceGroup>
      </div>

      {addons.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={addonsOpen}
            onClick={openAddons}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 text-left text-[15px] font-semibold transition-colors hover:bg-[var(--muted)]"
          >
            Add to every tiffin?
            <span className={`text-[13px] font-normal ${muted}`}>{addonCount > 0 ? `${addonCount} added` : "Optional"}</span>
          </button>
          {addonsOpen && <AddonsPanel addons={addons} categoryLabels={catalog.categoryLabels} selections={sel} set={set} className="mt-3" />}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3">
          <p className={label}>Deliver to</p>
          {savedAddresses.length > 1 && (
            <button type="button" className="text-[15px] font-semibold text-[var(--primary)]" onClick={() => setPickingAddress((o) => !o)}>
              {pickingAddress ? "Done" : "Change"}
            </button>
          )}
        </div>
        {pickingAddress ? (
          <div className="mt-3">
            <CheckoutAddressPicker
              addresses={savedAddresses}
              value={addressId}
              onPick={(a) => { setAddressId(a?.publicId ?? null); setPickingAddress(false); }}
              dropOffs={addressDropOffs}
            />
          </div>
        ) : (
          <p className="mt-1.5 text-[15px]">
            {address ? <><span className="font-semibold">{address.label}</span> <span className={muted}>{formatAddress(address)}</span></> : <span className={muted}>No saved address. Add one at checkout.</span>}
          </p>
        )}
      </div>

      {submitError && (admin ? <p role="alert" className="text-sm text-destructive">{submitError}</p> : <Notice tone="error">{submitError}</Notice>)}

      {admin ? (
        <div className="bg-background sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t px-1 pt-3">
          {totalBlock}
          {submitButton}
        </div>
      ) : (
        <BottomBar alignEnd className="sm:sticky sm:px-0">
          <div className="flex flex-1 items-center justify-between gap-3 sm:flex-none sm:gap-6">
            {totalBlock}
            {submitButton}
          </div>
        </BottomBar>
      )}

      {!admin && (
        <Sheet
          open={addonsSheet}
          onClose={() => setAddonsSheet(false)}
          title="Add to every tiffin?"
          footer={<Button variant="primary" size="lg" className="w-full" onClick={() => setAddonsSheet(false)}>{addonCount > 0 ? "Done" : "Skip extras"}</Button>}
        >
          <AddonsPanel bare addons={addons} categoryLabels={catalog.categoryLabels} selections={sel} set={set} className="pb-2" />
        </Sheet>
      )}
    </div>
  );
}
