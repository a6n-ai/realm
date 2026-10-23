import { useEffect, useMemo, useState } from "react";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { reprice } from "@/app/(public)/subscribe/actions";
import { dropOffCatalog, validDropOff } from "@/lib/catalog/drop-off";
import { offeredAddons, type WizardSelections } from "@/components/wizard/selections";
import { formatDateOnly } from "@/lib/format/datetime";
import { appToday, firstStartOnOrAfter } from "@/lib/services/start-date";
import type { PricingResult } from "@/lib/pricing";
import type { QuickRenewData } from "./types";

export type QuickRenewProps = QuickRenewData & {
  submitLabel: string;
  /** Returns an error message, or null when the order was placed. */
  onSubmit: (s: WizardSelections, addressPublicId: string | null) => Promise<string | null>;
};

/** State and rules shared by the customer and admin shells. */
export function useQuickRenew({ catalog, initial, minStartDate, lastTiffin, holidayDates, savedAddresses, addressDropOffs, defaultAddressPublicId, onSubmit }: QuickRenewProps) {
  const [sel, setSel] = useState<WizardSelections>(initial);
  const set = (patch: Partial<WizardSelections>) => setSel((s) => ({ ...s, ...patch }));
  const [addressId, setAddressId] = useState<string | null>(defaultAddressPublicId);
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

  useEffect(() => {
    let active = true;
    setPrice((p) => ({ ...p, loading: true, error: null }));
    // The saved address's drop-off fee is part of what checkout charges, so the quote must carry it or the total jumps on the pay step.
    const drop = validDropOff(dropOffCatalog(catalog.deliveryCharges, catalog.waivers), address ? addressDropOffs[address.publicId] : null);
    reprice({ ...sel, deliveryTagId: drop.tagId, deliveryStrategyIds: drop.strategyIds }, undefined, sel.planKey ?? undefined, undefined, undefined, address?.postalCode, address?.addressLine, address?.city)
      .then((r) => { if (active) setPrice({ result: "error" in r ? null : r.pricing, error: "error" in r ? r.error : null, loading: false }); })
      .catch(() => { if (active) setPrice({ result: null, error: "Couldn't load the price.", loading: false }); });
    return () => { active = false; };
  }, [sel, address, retry, catalog, addressDropOffs]);

  const dayDisabledReason = (iso: string): string | undefined =>
    iso < minDate ? "Before the earliest available date"
      : closed.has(iso) ? "We are closed that day"
      : !allowed.includes(weekdayKey(parseIsoDateUtc(iso))) ? "Not a delivery day"
      : undefined;

  const onStartDate = (v: string) => {
    if (!v) return;
    const why = dayDisabledReason(v);
    if (why) return setDateError(v < minDate ? `Earliest available start date is ${formatDateOnly(minDate, { mode: "short" })}` : why === "Not a delivery day" ? "That day isn't a delivery day for this plan" : "We are closed that day. Pick another start date");
    setDateError(null);
    set({ startDate: v });
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const err = await onSubmit(sel, addressId);
      // On success the page navigates away; keep the button locked so a second tap cannot place a second order.
      if (err) { setSubmitError(err); setSubmitting(false); }
    } catch {
      setSubmitError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return {
    catalog, savedAddresses, sel, set, plan, meal, allowed, minDate, earliest, address, addressId, setAddressId, addons, addonCount,
    price, retry: () => setRetry((n) => n + 1), dayDisabledReason, onStartDate, dateError, setDateError,
    submit, submitting, submitError,
    canSubmit: !!sel.startDate && !price.loading && !price.error && !!price.result && !submitting,
    keptDefault: sel.startDate === initial.startDate && !!lastTiffin,
  };
}
