"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { useDeliveryArea } from "@/components/customer/address/delivery-area";
import { dropOffCatalog, NO_DROP_OFF, validDropOff, type DropOffValue } from "@/lib/catalog/drop-off";
import type { PricingResult } from "@/lib/pricing";
import { unwrapAction } from "@/lib/actions/unwrap";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import {
  listCheckoutPaymentMethods,
  type CheckoutPaymentMethod,
} from "@/app/(public)/subscribe/actions";
import type { AdminOrderCreated } from "@/app/(dashboard)/dashboard/orders/admin-order-created-dialog";
import { eatingDaysError, frequencyFits, type DayOfWeek } from "@/lib/menu/delivery-days";
import { DEFAULT_EATING_DAYS, quoteLinkQuery } from "@/components/wizard/selections";
import { orderFormSchema, type OrderFormInput, type OrderFormValues } from "../order-schema";
import { appToday } from "@/lib/services/start-date";
import { earliestTrialIso, nextTrialStart, trialSendDays, type TrialSettings } from "@/lib/trial/schedule";
import { convertInquiry, customerOrderContext, orderFormDeliveryOptions, previewPrice, repCouponInfo, trialFormSettings, type CustomerOrderContext, type RepCouponInfo, type StaffCoinPreview, type StaffCouponPreview } from "./actions";
import { plannedSchedule } from "@/components/wizard/schedule-card";
import {
  buildOrderInput, firstWeekdayOnOrAfter, missingFields, multiDayTrialPicks, round2,
  type Catalog,
} from "./order-draft";

export type EnabledSlot = { key: string; label: string };

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  planKey: "Diet",
  mealSizeId: "Meal size",
  frequencyKey: "Delivery days",
  eatingDays: "Eating days",
  persons: "Persons",
  mealSlots: "Meals",
  durationWeeks: "Duration",
  startDate: "Start date",
  addressLine: "Street address",
  city: "City",
  postalCode: "Postal code",
};

const NO_CUSTOMER: CustomerOrderContext = { renewFrom: null, plans: [], conflict: false, addresses: [] };

type DeliveryOptions = Awaited<ReturnType<typeof orderFormDeliveryOptions>>;

/** What an estimate's side panel shows and drives: the live price and the customer coupon lane. */
export type EstimateState = {
  preview: PricingResult | null;
  error: string | null;
  copyText: string | null;
  /** The long subscribe link inside copyText, so the panel can swap in a short /q/ link. */
  link: string | null;
  coupons: StaffCouponPreview | null;
  /** The matched customer's coins on this quote; null for a new customer. */
  coins: StaffCoinPreview | null;
  /** How many coins the customer wants to use; "max" (the default) takes all this order allows. */
  setCoins: (coins: number | "max") => void;
  codes: string[];
  apply: (code: string) => void;
  remove: (code: string) => void;
  applyAll: (codes: string[]) => void;
};

export type OrderDraftParams = {
  estimateOnly?: boolean;
  onEstimate?: (e: EstimateState) => void;
  page?: "order" | "payment";
  onContinue?: () => void;
  /** True when the parent renders a review summary on the payment page. */
  hasSummary: boolean;
  inquiryId: string;
  contact: { fullName: string; phone: string; email: string };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  prefill?: Partial<OrderFormInput>;
  onCreate?: (order: CreateOrderInput) => Promise<AdminOrderCreated>;
  onReview?: (draft: { order: CreateOrderInput; preview: PricingResult }) => void;
};

export function useOrderDraft({
  inquiryId, contact, catalog, enabledSlots, prefill, onCreate, onReview, page, onContinue, hasSummary,
  estimateOnly = false, onEstimate,
}: OrderDraftParams) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PricingResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [repInfo, setRepInfo] = useState<RepCouponInfo | null>(null);
  const [discount, setDiscount] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);
  // The customer coupon code on this order; the preview says whether it landed.
  // Every code staff entered; the preview says which landed and why the others didn't.
  const [couponCodes, setCouponCodes] = useState<string[]>([]);
  const [couponInput, setCouponInput] = useState("");
  const [coupons, setCoupons] = useState<StaffCouponPreview | null>(null);
  // An estimate shows the best price (all allowed coins); a real order spends none until staff opt in.
  const [coinsWanted, setCoinsWanted] = useState<number | "max">(estimateOnly ? "max" : 0);
  const [coinPreview, setCoinPreview] = useState<StaffCoinPreview | null>(null);
  // Whose wallet coinPreview was priced against. An order only spends coins for that same contact, so a
  // submit made after switching customer, before the new preview lands, can't carry the old wallet's count.
  const coinPreviewFor = useRef<string | null>(null);
  const walletKey = (formEmail: string) => `${formEmail.trim().toLowerCase()}|${contact.email.trim().toLowerCase()}|${contact.phone}`;
  const removeCoupon = (code: string) => setCouponCodes((cs) => cs.filter((c) => c !== code.toUpperCase()));
  const applyCoupon = (code: string) => {
    const next = code.trim().toUpperCase();
    if (next) setCouponCodes((cs) => (cs.includes(next) ? cs : [...cs, next]));
    setCouponInput("");
  };
  // Stable, and leaves the typed coupon alone: the staff-code field re-applies its code on every change of this.
  const applyStaffCode = useCallback((code: string) => setCouponCodes((cs) => (cs.includes(code.toUpperCase()) ? cs : [...cs, code.toUpperCase()])), []);
  // Apply all: offer every listed code, let the server pick the best combination, then drop
  // the ones that didn't make it so only real savings stay on the order.
  const bulkCodes = useRef<string[] | null>(null);
  const applyAllCoupons = (codes: string[]) => {
    const fresh = codes.map((c) => c.toUpperCase()).filter((c) => !couponCodes.includes(c));
    if (fresh.length === 0) return;
    bulkCodes.current = fresh;
    setCouponCodes((cs) => [...cs, ...fresh]);
  };
  const [paymentMethods, setPaymentMethods] = useState<CheckoutPaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminOrderCreated | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [trialSettings, setTrialSettings] = useState<TrialSettings | null>(null);
  const [pickedDays, setPickedDays] = useState<DayOfWeek[]>([]);
  // First free day after the customer's running plans; the new plan renews from there.
  const [customerCtx, setCustomerCtx] = useState<CustomerOrderContext>(NO_CUSTOMER);
  const renewFrom = customerCtx.renewFrom;
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOptions | null>(null);
  // A picked saved address (its fields and notes come from the address book), or null for a typed one.
  const [addressPublicId, setAddressPublicId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [addressTagId, setAddressTagId] = useState<string | null>(null);
  const [dropOff, setDropOff] = useState<DropOffValue>(NO_DROP_OFF);

  const defaultSlots = enabledSlots.some((s) => s.key === "lunch")
    ? ["lunch"]
    : enabledSlots.slice(0, 1).map((s) => s.key);

  const form = useForm<OrderFormInput, unknown, OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      planKey: "",
      mealSizeId: "",
      frequencyKey: catalog.frequencies.find((f) => f.weekdays?.length)?.key ?? "",
      eatingDays: DEFAULT_EATING_DAYS.slice(0, catalog.maxTiffinsPerWeek ?? 7),
      persons: 1,
      mealSlots: defaultSlots,
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: catalog.durations[0]?.weeks ?? 1,
      startDate: "",
      addonSelections: [],
      email: contact.email,
      addressLine: "",
      city: "",
      postalCode: "",
      ...prefill,
    },
  });

  const submitting = form.formState.isSubmitting;

  const planKey = form.watch("planKey");
  const mealSizeId = form.watch("mealSizeId");
  const frequencyKey = form.watch("frequencyKey");
  const eatingDays = form.watch("eatingDays") as DayOfWeek[];
  const persons = form.watch("persons");
  const mealSlots = form.watch("mealSlots");
  const durationWeeks = form.watch("durationWeeks");
  const startDate = form.watch("startDate");
  const addonSelections = form.watch("addonSelections") ?? [];
  const addressLine = form.watch("addressLine");
  const city = form.watch("city");
  const postalCode = form.watch("postalCode");
  const email = form.watch("email");
  const deliveryArea = useDeliveryArea(postalCode);

  // The picked size's allowed days: only frequencies that deliver on them are offered (non-veg only, Tue/Thu veg-only).
  const sizeDays = catalog.mealSizes.find((m) => m.id === mealSizeId)?.allowedDays ?? null;
  const deliveryFrequencies = catalog.frequencies.filter((f) => f.weekdays?.length && frequencyFits(f.weekdays as DayOfWeek[], sizeDays));
  const bounds = { min: catalog.minTiffinsPerWeek ?? 3, max: catalog.maxTiffinsPerWeek ?? 7 };
  const deliveryDays = (deliveryFrequencies.find((f) => f.key === frequencyKey)?.weekdays ?? []) as DayOfWeek[];
  const toggleEating = (d: DayOfWeek) => {
    const next = eatingDays.includes(d)
      ? (eatingDays.length > bounds.min ? eatingDays.filter((x) => x !== d) : eatingDays)
      : eatingDays.length < bounds.max ? [...eatingDays, d] : eatingDays;
    form.setValue("eatingDays", (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).filter((x) => next.includes(x)), { shouldDirty: true, shouldValidate: true });
  };

  const durations = [...new Map(catalog.durations.map((d) => [d.weeks, d])).values()].sort((a, b) => a.weeks - b.weeks);
  const mealsForPlan = catalog.mealSizes.filter((m) => !planKey || m.diet === planKey);
  const selectedSize = catalog.mealSizes.find((m) => m.id === mealSizeId);
  const isTrial = selectedSize?.trial === true;
  // Trials never carry add-ons.
  const eligibleAddons = isTrial ? [] : (selectedSize?.addons ?? []);
  const qtyFor = (key: string) => addonSelections.find((s) => s.key === key)?.qty ?? 0;
  const setAddonQty = (key: string, qty: number) => {
    const rest = addonSelections.filter((s) => s.key !== key);
    form.setValue("addonSelections", qty > 0 ? [...rest, { key, qty }] : rest, { shouldDirty: true });
  };
  // Trial send days for this meal: no Sat/Sun when it has no weekend dish.
  const trialWeekdays = trialSettings ? trialSendDays(trialSettings.weekdays, selectedSize?.servesWeekends ?? true, selectedSize?.allowedDays) : [];
  const trialOpen = isTrial && trialSettings?.maxDays != null && trialSettings.maxDays >= 1 && trialWeekdays.length > 0;
  const baseMinStart = isTrial && trialSettings
    ? earliestTrialIso(appToday(catalog.timezone, catalog.cutoffHour), trialWeekdays)
    : nextWeekday(appToday(catalog.timezone, catalog.cutoffHour)).toISOString().slice(0, 10);
  const renewalBound = renewFrom != null && renewFrom > baseMinStart;
  const minStart = renewalBound ? renewFrom : baseMinStart;
  // The renewal date itself may fall on a non-start day; offer the first one on/after it.
  const renewalStart = !renewalBound
    ? null
    : isTrial
      ? nextTrialStart(renewFrom, multiDayTrialPicks(pickedDays, trialWeekdays, trialSettings?.maxDays ?? 0)) ?? renewFrom
      : firstWeekdayOnOrAfter(renewFrom);
  const realPayments = paymentMethods.length > 0;
  const trialMax = trialSettings?.maxDays ?? 0;
  const multiDayTrial = trialMax > 1;
  const trialFrequencyName = catalog.frequencies.find((f) => f.key === trialSettings?.frequencyKey)?.name;
  const trialKey = `${trialWeekdays.join()}|${trialMax}`;
  // A typed date passes through partial years (0002-10-06) that the parser rejects; treat those as no date yet.
  const startDay = (() => {
    try {
      return startDate ? (weekdayKey(parseIsoDateUtc(startDate)) as DayOfWeek) : null;
    } catch {
      return null;
    }
  })();
  // A one-day trial has nothing to pick: the start date is the day.
  const trialPicks = multiDayTrial ? pickedDays : startDay && trialWeekdays.includes(startDay) ? [startDay] : [];
  const trialStartOk = !isTrial || (!!startDay && trialPicks.includes(startDay));
  const freqRow = deliveryFrequencies.find((f) => f.key === frequencyKey);
  const schedule = plannedSchedule(
    isTrial
      ? { kind: "trial", startDate, picks: trialStartOk ? trialPicks : [] }
      : { kind: "weekly", startDate, durationWeeks: Number(durationWeeks), frequency: freqRow ? { key: freqRow.key, weekdays: freqRow.weekdays ?? null } : null, eatingDays },
  );

  // Keep the picks inside the send days and the max; default to the first send day.
  useEffect(() => {
    setPickedDays((prev) => {
      const kept = trialWeekdays.filter((d) => prev.includes(d)).slice(0, trialMax);
      return kept.length ? kept : trialWeekdays.slice(0, 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialKey]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      customerOrderContext(email ?? "", contact.phone)
        .then((c) => { if (live) setCustomerCtx(c); })
        .catch(() => { if (live) setCustomerCtx(NO_CUSTOMER); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [email, contact.phone]);

  // An estimate switches customer without remounting, so the plan picked so far survives.
  useEffect(() => {
    if (estimateOnly) form.setValue("email", contact.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateOnly, contact.email]);

  // Renewal: an empty or now-overlapping start jumps to the day after the current plan.
  useEffect(() => {
    if (!renewalStart) return;
    if (!startDate || startDate < renewFrom!) form.setValue("startDate", renewalStart, { shouldDirty: true, shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renewalStart]);

  // A trial starts on a picked day; move the start date there when the picks change.
  useEffect(() => {
    if (!isTrial || pickedDays.length === 0 || (multiDayTrial ? trialStartOk : !!startDate) && startDate >= minStart) return;
    const next = nextTrialStart(startDate && startDate > minStart ? startDate : minStart, multiDayTrial ? pickedDays : trialWeekdays);
    if (next) form.setValue("startDate", next, { shouldDirty: true, shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrial, multiDayTrial, pickedDays.join()]);

  useEffect(() => {
    if (!mealSizeId) return;
    if (mealsForPlan.some((m) => m.id === mealSizeId)) return;
    form.setValue("mealSizeId", mealsForPlan[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  // Add-on eligibility follows the meal size; a stale pick would fail pricing.
  // A renewal prefill sets size and add-ons together, so it skips this reset once.
  const keepAddonsOnce = useRef(false);
  useEffect(() => {
    if (keepAddonsOnce.current) {
      keepAddonsOnce.current = false;
      return;
    }
    if (form.getValues("addonSelections")?.length) form.setValue("addonSelections", []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealSizeId]);

  useEffect(() => {
    let cancelled = false;
    orderFormDeliveryOptions().then((o) => { if (!cancelled) setDeliveryOptions(o); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    trialFormSettings()
      .then((s) => {
        if (cancelled) return;
        setTrialSettings(s);
      })
      .catch(() => { if (!cancelled) setTrialSettings(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listCheckoutPaymentMethods()
      .then((methods) => {
        if (cancelled) return;
        setPaymentMethods(methods);
        if (methods.length > 0) setPaymentMethodId((prev) => prev ?? methods[0]!.id);
      })
      .catch(() => {
        if (!cancelled) setPaymentMethods([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const buildInput = (v: OrderFormValues): CreateOrderInput =>
    buildOrderInput(v, {
      mealSizes: catalog.mealSizes,
      trialFrequencyKey: trialSettings?.frequencyKey ?? undefined,
      trialPicks,
      contact,
      notes,
      addressTagId,
      dropOff,
      addressPublicId,
      realPayments,
      paymentMethodId,
      couponCodes,
      repInfo,
      discount,
      // What the preview settled on, so the order spends exactly the coins the shown total assumes.
      coins: estimateOnly || coinPreviewFor.current !== walletKey(v.email ?? "") ? undefined : (coinPreview?.used ?? 0),
    });


  const shownPreview = preview;
  const subtotal = shownPreview?.subtotal ?? 0;
  const ceiling = repInfo?.available
    ? round2(Math.min((subtotal * repInfo.capPct) / 100, repInfo.capAmount))
    : 0;

  useEffect(() => {
    let cancelled = false;
    repCouponInfo().then((r) => { if (!cancelled) setRepInfo(r); }).catch(() => { if (!cancelled) setRepInfo(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mealSizeId || !planKey) return;
    let cancelled = false;
    const repCode = repInfo?.available && !estimateOnly ? repInfo.code : undefined;
    const pricedFor = walletKey(email ?? "");
    previewPrice(
      buildInput({
        planKey,
        mealSizeId,
        frequencyKey,
        eatingDays,
        persons: Number(persons),
        mealSlots,
        includeSaturday: eatingDays.includes("sat"),
        includeSunday: eatingDays.includes("sun"),
        durationWeeks: Number(durationWeeks),
        startDate,
        addonSelections,
        email: email ?? "",
        addressLine: addressLine ?? "",
        city: city ?? "",
        postalCode: postalCode ?? "",
      }),
      repCode,
      discount > 0 ? discount : undefined,
      coinsWanted,
    )
      .then((r) => {
        if (cancelled) return;
        setPreview("error" in r ? null : r.preview);
        setCoupons("error" in r ? null : r.coupons);
        setCoinPreview("error" in r ? null : r.coins);
        coinPreviewFor.current = "error" in r ? null : pricedFor;
        const bulk = bulkCodes.current;
        if (bulk && !("error" in r)) {
          bulkCodes.current = null;
          const drop = bulk.filter((c) => !r.coupons.applied.some((a) => a.code.toUpperCase() === c));
          if (drop.length) setCouponCodes((cs) => cs.filter((c) => !drop.includes(c)));
        }
        setPreviewError("error" in r ? r.error : null);
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(null);
        setCoinPreview(null);
        coinPreviewFor.current = null;
        setPreviewError("Couldn't price this order. Check your connection and try again.");
      });
    return () => { cancelled = true; };
    // Postal code's first letter is its province, which sets the tax rate; the rest is per-keystroke noise.
    // email/addressLine/city/full postalCode intentionally excluded — they don't affect
    // pricing and are per-keystroke, so including them would refire preview on every
    // character typed. contact.fullName/phone are included since buildInput reads
    // them (stale otherwise if a future field starts depending on them for price).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, mealSizeId, frequencyKey, eatingDays, persons, mealSlots, durationWeeks, startDate, JSON.stringify(addonSelections), discount, couponCodes.join(), repInfo, paymentMethodId, contact.fullName, contact.phone, contact.email, trialPicks.join(), isTrial, addressTagId, dropOff.tagId, dropOff.strategyIds.join(), postalCode?.trim().charAt(0).toUpperCase(), coinsWanted]);

  useEffect(() => {
    if (discount > ceiling) setDiscount(ceiling);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceiling]);

  const dropOffs = dropOffCatalog(deliveryOptions?.deliveryCharges ?? undefined, deliveryOptions?.waivers);

  function pickSavedAddress(id: string | null) {
    setAddressPublicId(id);
    const a = customerCtx.addresses.find((x) => x.publicId === id);
    if (!a) return;
    for (const [key, value] of [["addressLine", a.addressLine], ["city", a.city], ["postalCode", a.postalCode]] as const) {
      form.setValue(key, value ?? "", { shouldDirty: true, shouldValidate: true });
    }
    setNotes(a.deliveryInstructions ?? "");
    setDropOff(validDropOff(dropOffs, a.dropOff));
  }

  /** Fill the plan from an earlier order (Renew last plan). Start date is left to the renewal rule. */
  function applyPrefill(prefill: Partial<OrderFormInput>, addressPublicId: string | null) {
    const { startDate: _start, email: _email, ...plan } = prefill;
    if (plan.mealSizeId && plan.mealSizeId !== form.getValues("mealSizeId")) keepAddonsOnce.current = true;
    for (const [key, value] of Object.entries(plan) as [keyof OrderFormInput, OrderFormInput[keyof OrderFormInput]][]) {
      if (value !== undefined) form.setValue(key, value as never, { shouldDirty: true, shouldValidate: true });
    }
    if (addressPublicId && customerCtx.addresses.some((a) => a.publicId === addressPublicId)) pickSavedAddress(addressPublicId);
    else if (plan.addressLine) setAddressPublicId(null);
  }

  // An existing customer starts on their default saved address, same as checkout.
  useEffect(() => {
    if (addressPublicId != null || addressLine) return;
    const preferred = customerCtx.addresses.find((a) => a.isDefault) ?? customerCtx.addresses[0];
    if (preferred) pickSavedAddress(preferred.publicId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerCtx]);

  useEffect(() => {
    if (!estimateOnly || !onEstimate) return;
    const plan = catalog.plans.find((p) => p.key === planKey)?.name;
    const meal = catalog.mealSizes.find((m) => m.id === mealSizeId)?.name;
    const freq = catalog.frequencies.find((f) => f.key === frequencyKey)?.name;
    // A WhatsApp-ready quote (*bold* renders there): what to pick on the website, the codes to
    // type at checkout, and the exact total they will see.
    const money = (n: number) => `$${n.toFixed(2)}`;
    const days = eatingDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ");
    const toType = coupons?.applied.filter((c) => !c.auto).map((c) => c.code) ?? [];
    const firstName = contact.fullName.trim().split(/\s+/)[0];
    // Opens the customer's subscribe stepper on these picks, codes ready at checkout (see selectionsFromQuote).
    const link = `${window.location.origin}/subscribe?${quoteLinkQuery({ planKey, mealSizeId, frequencyKey, eatingDays, durationWeeks: Number(durationWeeks), addonSelections, codes: toType, coins: coinPreview?.used })}`;
    const copyText = shownPreview
      ? [
          `Hi${firstName ? ` ${firstName}` : ""}! Here is your Tiffin Grab estimate:`,
          "",
          `*Meal:* ${[plan, meal].filter(Boolean).join(" · ")}`,
          `*Delivery:* ${freq ?? ""}${days ? ` (eating ${days})` : ""}`,
          `*Duration:* ${durationWeeks} ${Number(durationWeeks) === 1 ? "week" : "weeks"} · ${shownPreview.tiffinCount} ${shownPreview.tiffinCount === 1 ? "tiffin" : "tiffins"}`,
          "",
          ...shownPreview.lineItems.map((li) => `${li.label}: ${money(li.amount)}`),
          ...shownPreview.adjustments.map((d) => `${d.label}: -${money(d.amount)}`),
          ...(shownPreview.taxLines ?? []).map((t) => `${t.name} (${t.ratePct}%): ${money(t.amount)}`),
          `*Total: ${money(shownPreview.total)}*`,
          ...(toType.length
            // One code per line in monospace, so it can be long-pressed and copied on its own.
            ? ["", `*Coupon code${toType.length > 1 ? "s" : ""} to enter at checkout:*`, ...toType.map((c) => "```" + c + "```")]
            : []),
          ...(coinPreview?.used ? ["", `*Coins to use at checkout:* ${coinPreview.used}`] : []),
          "",
          `Order here: ${link}`,
        ].join("\n")
      : null;
    onEstimate({
      preview: shownPreview,
      error: shownPreview ? null : previewError,
      copyText,
      link: shownPreview ? link : null,
      coupons,
      coins: coinPreview,
      setCoins: setCoinsWanted,
      codes: couponCodes,
      apply: applyCoupon,
      remove: removeCoupon,
      applyAll: applyAllCoupons,
    });
    // Every input to the text also reprices, so the preview alone is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownPreview, previewError, coupons, couponCodes.join(), coinPreview]);

  const orderFields = ["planKey", "mealSizeId", "frequencyKey", "eatingDays", "persons", "mealSlots", "durationWeeks", "startDate"] as const;
  async function continueToPayment() {
    setError(null);
    if (!(await form.trigger(estimateOnly ? orderFields.filter((f) => f !== "startDate") : orderFields))) return;
    if (isTrial && !trialOpen) return setError("Trials aren't available right now");
    if (isTrial && !trialStartOk && !estimateOnly) return setError("Pick a start date on a trial day");
    if (!isTrial) {
      const err = eatingDaysError(deliveryDays, eatingDays, bounds);
      if (err) return setError(err);
    }
    onContinue?.();
  }

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    if (isTrial && !trialOpen) {
      setError("Trials aren't available right now");
      return;
    }
    if (isTrial && !trialStartOk) {
      setError("Pick a start date on a trial day");
      return;
    }
    if (!isTrial) {
      const err = eatingDaysError(deliveryDays, v.eatingDays, bounds);
      if (err) {
        setError(err);
        return;
      }
    }
    if (realPayments && !paymentMethodId) {
      setError("Choose a payment method");
      return;
    }
    const orderInput = buildInput(v);
    if (onReview) {
      if (!shownPreview) {
        setError("Wait for the price preview, or fix the plan so it can be priced");
        return;
      }
      onReview({ order: orderInput, preview: shownPreview });
      return;
    }
    try {
      const result = onCreate
        ? await onCreate(orderInput)
        : await unwrapAction(convertInquiry(inquiryId, orderInput));
      setCreated(result);
      setSuccessOpen(true);
      // Do not call onCreated here — closing a parent sheet would unmount this dialog.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create order");
    }
  }, (errors) => {
    // Some fields live on another step (email on Contact, plan on Order), where their own message
    // can't be seen; name the first failing one here so Create never fails silently.
    const [field, err] = Object.entries(errors)[0] ?? [];
    if (!field) return;
    const label = FIELD_LABELS[field] ?? field;
    setError(`${label}: ${err?.message || "check this field"}${field === "email" && page ? " (go back to Contact to fix it)" : ""}`);
  });

  const missing = missingFields({ page, estimateOnly, mealSizeId, startDate, isTrial, trialStartOk, addressLine, city, postalCode, realPayments, paymentMethodId });
  const liveDraft = page === "payment" && hasSummary
    ? {
        order: buildInput({ ...(form.getValues() as OrderFormValues), persons: Number(persons), durationWeeks: Number(durationWeeks) }),
        preview: shownPreview,
      }
    : null;

  return {
    form,
    applyPrefill,
    coinPreview,
    setCoinsWanted,
    submitting,
    error,
    preview,
    previewError,
    repInfo,
    discount,
    setDiscount,
    discountOpen,
    setDiscountOpen,
    couponInput,
    setCouponInput,
    coupons,
    couponCodes,
    removeCoupon,
    applyCoupon,
    applyAllCoupons,
    applyStaffCode,
    paymentMethods,
    paymentMethodId,
    setPaymentMethodId,
    created,
    successOpen,
    setSuccessOpen,
    customerCtx,
    renewFrom,
    deliveryOptions,
    addressPublicId,
    pickSavedAddress,
    notes,
    setNotes,
    addressTagId,
    setAddressTagId,
    dropOff,
    setDropOff,
    dropOffs,
    planKey,
    mealSizeId,
    frequencyKey,
    eatingDays,
    startDate,
    addressLine,
    city,
    postalCode,
    deliveryArea,
    deliveryFrequencies,
    bounds,
    sizeDays,
    toggleEating,
    durations,
    eligibleAddons,
    qtyFor,
    setAddonQty,
    isTrial,
    realPayments,
    trialOpen,
    multiDayTrial,
    trialFrequencyName,
    trialWeekdays,
    trialMax,
    pickedDays,
    setPickedDays,
    trialStartOk,
    minStart,
    renewalBound,
    renewalStart,
    schedule,
    subtotal,
    ceiling,
    missing,
    liveDraft,
    continueToPayment,
    onSubmit,
    shownPreview,
  };
}
