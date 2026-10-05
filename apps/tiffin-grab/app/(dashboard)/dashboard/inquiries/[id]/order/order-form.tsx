"use client";

import { useEffect, useState } from "react";
import { PaymentInstructions } from "@/components/payment-instructions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CheckIcon, CopyIcon, Loader2Icon, MinusIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import type { CatalogAddon } from "@/lib/catalog/types";
import { nextWeekday, parseIsoDateUtc, weekdayKey } from "@foundry/commons";
import { cn } from "@foundry/ui/cn";
import { Button } from "@foundry/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { Textarea } from "@foundry/ui/textarea";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { AddressFields } from "@foundry/ui/address-fields";
import { DeliveryAreaNote, useDeliveryArea } from "@/components/customer/address/delivery-area";
import { DropOffPicker } from "@/components/customer/address/drop-off";
import { dropOffCatalog, NO_DROP_OFF, validDropOff, type DropOffValue } from "@/lib/catalog/drop-off";
import type { PricingResult } from "@/lib/pricing";
import { unwrapAction } from "@/lib/actions/unwrap";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import {
  listCheckoutPaymentMethods,
  type CheckoutPaymentMethod,
} from "@/app/(public)/subscribe/actions";
import {
  AdminOrderCreatedDialog,
  type AdminOrderCreated,
} from "@/app/(dashboard)/dashboard/orders/admin-order-created-dialog";
import { eatingDaysError, type DayOfWeek } from "@/lib/menu/delivery-days";
import { DEFAULT_EATING_DAYS } from "@/components/wizard/selections";
import { orderFormSchema, type OrderFormInput, type OrderFormValues } from "../order-schema";
import { appToday } from "@/lib/services/start-date";
import { earliestTrialIso, nextTrialStart, toggleTrialPick, trialSendDays, type TrialSettings } from "@/lib/trial/schedule";
import { convertInquiry, customerOrderContext, orderFormDeliveryOptions, previewPrice, repCouponInfo, trialFormSettings, type CustomerOrderContext, type RepCouponInfo } from "./actions";
import { DayPicker, dayName, ScheduleSection } from "./schedule-section";
import { plannedSchedule, ScheduleCard } from "@/components/wizard/schedule-card";
import { PlanMealPicker } from "../../../_leads/plan-interest-fields";

const APP_NAME = "Tiffin Grab";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** One group of the order form: a heading, one line of help, an optional header control. */
function FormSection({ title, hint, action, hidden = false, children }: { title: string; hint?: string; action?: React.ReactNode; hidden?: boolean; children: React.ReactNode }) {
  // Hidden, not unmounted: a step switch must keep what staff already entered.
  return (
    <section className={cn("grid gap-4", hidden && "hidden")}>
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-0.5">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-balance">{title}</h3>
          {hint && <p className="text-muted-foreground text-[13px] text-pretty">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Custom meals: the server derives plan and meal size from the composition.
const customMealFormSchema = orderFormSchema.extend({ planKey: z.string(), mealSizeId: z.string() });

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string; trial?: boolean; servesWeekends?: boolean; addons?: CatalogAddon[] }[];
  frequencies: { key: string; name: string; weekdays?: string[] | null; savePct?: number }[];
  minTiffinsPerWeek?: number;
  timezone?: string;
  maxTiffinsPerWeek?: number;
  durations: { weeks: number }[];
};

type EnabledSlot = { key: string; label: string };

/** CRM toggle pill for DropOffPicker and address types (the customer kit pill is public-site styled). */
function AdminPill({ on, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors disabled:opacity-50",
        on ? "border-primary bg-primary/10 text-foreground font-medium" : "hover:bg-muted/50",
        className?.replace(/\b(h-10|text-\[14px\]|sm:text-\[14px\])\b/g, ""),
      )}
    />
  );
}

function chargeHint(item: { chargeType: "none" | "fixed" | "percent"; chargeValue: number }): string {
  if (item.chargeType === "none" || item.chargeValue === 0) return "Free";
  return item.chargeType === "fixed" ? `+$${item.chargeValue.toFixed(2)}` : `+${item.chargeValue}%`;
}

type DeliveryOptions = Awaited<ReturnType<typeof orderFormDeliveryOptions>>;

function firstWeekdayOnOrAfter(iso: string): string {
  const d = parseIsoDateUtc(iso);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function dayBeforeIso(iso: string): string {
  const d = parseIsoDateUtc(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const multiDayTrialPicks = (picked: readonly string[], weekdays: readonly string[], max: number) => (max > 1 && picked.length ? picked : weekdays);

export function OrderForm({
  inquiryId,
  contact,
  catalog,
  enabledSlots,
  prefill,
  onCreate,
  onCreated,
  onReview,
  paymentExtra,
  mealAction,
  mealBuilder,
  hideMealSizePicker = false,
  customMeal = null,
  page,
  onContinue,
  summary,
}: {
  /** Split into two steps: "order" = meal + schedule, "payment" = delivery + payment + review. Unset = one page. */
  page?: "order" | "payment";
  /** "order" page's Continue, after its fields validate. */
  onContinue?: () => void;
  /** Review block on top of the "payment" page, fed the live order and price. */
  summary?: (draft: { order: CreateOrderInput; preview: PricingResult | null }) => React.ReactNode;
  inquiryId: string;
  contact: { fullName: string; phone: string; email: string };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  prefill?: Partial<OrderFormInput>;
  /** Parent create path (New Order / New Customer). Must return ids — never redirect to `/activate`. */
  onCreate?: (order: CreateOrderInput) => Promise<AdminOrderCreated>;
  /** Called after success dialog is shown (e.g. close parent sheet). */
  onCreated?: (result: AdminOrderCreated) => void;
  /**
   * When set, the sticky CTA advances to a parent Review step instead of creating.
   * Requires a live price preview — create stays on the review step.
   */
  onReview?: (draft: { order: CreateOrderInput; preview: PricingResult }) => void;
  /** Extra content under the payment methods, given the selected method (e.g. an e-Transfer screenshot). */
  paymentExtra?: (paymentMethodId: string | null) => React.ReactNode;
  /** Control in the Meal section header (New order's Custom meal switch). */
  mealAction?: React.ReactNode;
  /** Replaces the plan/meal picker when set (the custom meal builder). */
  mealBuilder?: React.ReactNode;
  /** A custom meal builder replaces the plan/meal-size pills (New Order). */
  hideMealSizePicker?: boolean;
  /** The builder's composition, priced server-side for the footer preview. */
  customMeal?: { planKey: string; items: { category: string; planKey: string; tuAmount: number }[]; basePriceOverride: number | null } | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PricingResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [repInfo, setRepInfo] = useState<RepCouponInfo | null>(null);
  const [discount, setDiscount] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<CheckoutPaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminOrderCreated | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [trialSettings, setTrialSettings] = useState<TrialSettings | null>(null);
  const [pickedDays, setPickedDays] = useState<DayOfWeek[]>([]);
  // First free day after the customer's running plans; the new plan renews from there.
  const [customerCtx, setCustomerCtx] = useState<CustomerOrderContext>({ renewFrom: null, addresses: [] });
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
    // RHF re-reads options every render, so the resolver follows the toggle.
    resolver: zodResolver(hideMealSizePicker ? customMealFormSchema : orderFormSchema),
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

  const deliveryFrequencies = catalog.frequencies.filter((f) => f.weekdays?.length);
  const bounds = { min: catalog.minTiffinsPerWeek ?? 3, max: catalog.maxTiffinsPerWeek ?? 7 };
  const deliveryDays = (deliveryFrequencies.find((f) => f.key === frequencyKey)?.weekdays ?? []) as DayOfWeek[];
  const toggleEating = (d: DayOfWeek) => {
    const next = eatingDays.includes(d)
      ? (eatingDays.length > bounds.min ? eatingDays.filter((x) => x !== d) : eatingDays)
      : eatingDays.length < bounds.max ? [...eatingDays, d] : eatingDays;
    form.setValue("eatingDays", (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).filter((x) => next.includes(x)), { shouldDirty: true, shouldValidate: true });
  };

  const mealsForPlan = catalog.mealSizes.filter((m) => !planKey || m.diet === planKey);
  const selectedSize = catalog.mealSizes.find((m) => m.id === mealSizeId);
  const isTrial = selectedSize?.trial === true;
  // Custom meals have no catalog size to attach add-ons to; trials never carry them.
  const eligibleAddons = hideMealSizePicker || isTrial ? [] : (selectedSize?.addons ?? []);
  const qtyFor = (key: string) => addonSelections.find((s) => s.key === key)?.qty ?? 0;
  const setAddonQty = (key: string, qty: number) => {
    const rest = addonSelections.filter((s) => s.key !== key);
    form.setValue("addonSelections", qty > 0 ? [...rest, { key, qty }] : rest, { shouldDirty: true });
  };
  // Trial send days for this meal: no Sat/Sun when it has no weekend dish.
  const trialWeekdays = trialSettings ? trialSendDays(trialSettings.weekdays, selectedSize?.servesWeekends ?? true) : [];
  const trialOpen = isTrial && trialSettings?.maxDays != null && trialSettings.maxDays >= 1 && trialWeekdays.length > 0;
  const baseMinStart = isTrial && trialSettings
    ? earliestTrialIso(appToday(catalog.timezone), trialWeekdays)
    : nextWeekday(appToday(catalog.timezone)).toISOString().slice(0, 10);
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
      customerOrderContext(email ?? "")
        .then((c) => { if (live) setCustomerCtx(c); })
        .catch(() => { if (live) setCustomerCtx({ renewFrom: null, addresses: [] }); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [email]);

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
  useEffect(() => {
    if (form.getValues("addonSelections")?.length) form.setValue("addonSelections", []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealSizeId, hideMealSizePicker]);

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

  const buildInput = (v: OrderFormValues): CreateOrderInput => {
    const trial = catalog.mealSizes.find((m) => m.id === v.mealSizeId)?.trial === true;
    return {
    planKey: v.planKey,
    selections: {
      mealSizeId: v.mealSizeId,
      // A trial rides the frequency from Trial settings.
      frequencyKey: trial ? (trialSettings?.frequencyKey ?? v.frequencyKey) : v.frequencyKey,
      eatingDays: trial ? trialPicks : v.eatingDays,
      persons: v.persons,
      mealSlots: v.mealSlots,
      includeSaturday: trial ? false : v.eatingDays.includes("sat"),
      includeSunday: trial ? false : v.eatingDays.includes("sun"),
      durationWeeks: v.durationWeeks,
      startDate: v.startDate,
      addonSelections: trial || hideMealSizePicker ? [] : (v.addonSelections ?? []),
      ...(trial ? { trialDays: trialPicks.length } : {}),
      addressTagId,
      deliveryTagId: dropOff.tagId,
      deliveryStrategyIds: dropOff.strategyIds,
    },
    addressPublicId: addressPublicId ?? undefined,
    contact: {
      fullName: contact.fullName,
      phone: contact.phone,
      email: v.email,
      addressLine: v.addressLine,
      city: v.city,
      postalCode: v.postalCode,
      deliveryInstructions: notes.trim() || null,
    },
    paymentMethodId: realPayments ? paymentMethodId : null,
    repCoupon: repInfo?.available && discount > 0
      ? { code: repInfo.code, requestedAmount: discount }
      : undefined,
  };
  };

  // Serialized so a fresh-but-equal object from the parent doesn't refire the preview.
  const customKey = hideMealSizePicker && customMeal?.items.length ? JSON.stringify(customMeal) : "";
  // A catalog-size preview is meaningless once the custom builder takes over.
  const shownPreview = hideMealSizePicker && !customKey ? null : preview;
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
    if (hideMealSizePicker ? !customKey : !mealSizeId || !planKey) return;
    let cancelled = false;
    const repCode = repInfo?.available ? repInfo.code : undefined;
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
      customKey ? customMeal : undefined,
    )
      .then((r) => {
        if (cancelled) return;
        setPreview("error" in r ? null : r.preview);
        setPreviewError("error" in r ? r.error : null);
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(null);
        setPreviewError("Couldn't price this order. Check your connection and try again.");
      });
    return () => { cancelled = true; };
    // Postal code's first letter is its province, which sets the tax rate; the rest is per-keystroke noise.
    // email/addressLine/city/full postalCode intentionally excluded — they don't affect
    // pricing and are per-keystroke, so including them would refire preview on every
    // character typed. contact.fullName/phone are included since buildInput reads
    // them (stale otherwise if a future field starts depending on them for price).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, mealSizeId, frequencyKey, eatingDays, persons, mealSlots, durationWeeks, startDate, JSON.stringify(addonSelections), discount, repInfo, paymentMethodId, contact.fullName, contact.phone, hideMealSizePicker, customKey, trialPicks.join(), isTrial, addressTagId, dropOff.tagId, dropOff.strategyIds.join(), postalCode?.trim().charAt(0).toUpperCase()]);

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

  // An existing customer starts on their default saved address, same as checkout.
  useEffect(() => {
    if (addressPublicId != null || addressLine) return;
    const preferred = customerCtx.addresses.find((a) => a.isDefault) ?? customerCtx.addresses[0];
    if (preferred) pickSavedAddress(preferred.publicId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerCtx]);

  // Staff paste this into WhatsApp/SMS; the order code isn't known until create.
  async function copyPaymentDetails(m: CheckoutPaymentMethod) {
    const amount = shownPreview ? `$${shownPreview.total.toFixed(2)}` : "the order total";
    const lines = [
      `Hi ${contact.fullName.split(" ")[0] || "there"}, your ${APP_NAME} order total is ${amount}.`,
      m.id === "etransfer"
        ? `Please send an Interac e-Transfer of ${amount}${m.payeeHandle ? ` to ${m.payeeHandle}` : ""} with your name in the message, and share the screenshot with us.`
        : `Payment method: ${m.label}${m.payeeHandle ? ` (${m.payeeHandle})` : ""}.`,
      m.instructions?.trim() || null,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Payment details copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  const orderFields = ["planKey", "mealSizeId", "frequencyKey", "eatingDays", "persons", "mealSlots", "durationWeeks", "startDate"] as const;
  async function continueToPayment() {
    setError(null);
    if (!(await form.trigger(orderFields))) return;
    if (isTrial && !trialOpen) return setError("Trials aren't available right now");
    if (isTrial && !trialStartOk) return setError("Pick a start date on a trial day");
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
  });

  const orderMissing = [
    hideMealSizePicker ? !customKey && "custom meal items" : !mealSizeId && "meal size",
    !startDate && "start date",
    isTrial && !!startDate && !trialStartOk && "a start date on a trial day",
  ];
  const paymentMissing = [
    !addressLine && "address",
    !city && "city",
    !postalCode && "postal code",
    realPayments && !paymentMethodId && "payment method",
  ];
  const missing = (page === "order" ? orderMissing : [...orderMissing, ...paymentMissing]).filter(Boolean) as string[];
  const liveDraft = page === "payment" && summary
    ? {
        order: buildInput({ ...(form.getValues() as OrderFormValues), persons: Number(persons), durationWeeks: Number(durationWeeks) }),
        preview: shownPreview,
      }
    : null;

  return (
    <>
      <Form {...form}>
        <form onSubmit={onSubmit} className="relative [&>section]:py-6 [&>section:first-of-type]:pt-0 [&>section+section]:border-t">
          {submitting && (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2Icon className="text-primary size-8 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium">Creating order…</p>
                <p className="text-muted-foreground text-xs">
                  Pricing, payment, and schedule — this can take a few seconds.
                </p>
              </div>
            </div>
          )}

          {liveDraft && <section className="grid gap-5">{summary!(liveDraft)}</section>}

          <FormSection hidden={page === "payment"} title="Meal" hint={mealBuilder ? "Built item by item for this order." : "Diet, then the meal size."} action={mealAction}>
            <fieldset className="grid gap-4" disabled={submitting}>
              <FormField
                control={form.control}
                name="planKey"
                render={({ field }) => (
                  <FormItem className="hidden">
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mealSizeId"
                render={({ field }) => (
                  <FormItem className="hidden">
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )}
              />
              {mealBuilder}
              {!hideMealSizePicker && (
                <div className="grid gap-4">
                  <PlanMealPicker
                    catalog={catalog}
                    planKey={planKey}
                    mealSizeId={mealSizeId}
                    planRequired
                    onPlanChange={(key) => form.setValue("planKey", key, { shouldDirty: true, shouldValidate: true })}
                    onMealChange={(id) => form.setValue("mealSizeId", id, { shouldDirty: true, shouldValidate: true })}
                  />
                </div>
              )}
            </fieldset>
          </FormSection>

          <FormSection hidden={page === "payment"} title="Schedule" hint={isTrial ? `${multiDayTrial ? "Pick the days the trial arrives" : "A one-day trial arrives on its start date"}${trialFrequencyName ? ` · ${trialFrequencyName}` : ""}.` : "When it starts, how long it runs, and which days they eat."}>
            <fieldset className={cn("grid gap-4", isTrial ? "sm:grid-cols-2" : "sm:grid-cols-3")} disabled={submitting}>
              <FormField
                control={form.control}
                name="persons"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Persons <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input type="number" min={1} max={5} {...field} value={String(field.value ?? "")} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isTrial && (
              <FormField
                control={form.control}
                name="durationWeeks"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (weeks) <span className="text-destructive">*</span></FormLabel>
                    <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{catalog.durations.map((d) => <SelectItem key={d.weeks} value={String(d.weeks)}>{d.weeks}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              )}
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input type="date" min={minStart} {...field} /></FormControl>
                    {renewalBound ? (
                      <p className="text-muted-foreground text-xs text-pretty">
                        Renewal: current plan runs through {dayBeforeIso(renewFrom!)}. The new plan starts on or after{" "}
                        <button type="button" className="text-primary font-medium underline-offset-2 hover:underline" onClick={() => form.setValue("startDate", renewalStart!, { shouldDirty: true, shouldValidate: true })}>
                          {renewalStart}
                        </button>.
                      </p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>

          {isTrial && (
            <fieldset className="grid gap-2" disabled={submitting}>
              {trialOpen && multiDayTrial && (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">Trial days</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      <span className="text-foreground font-semibold">{pickedDays.length}</span> of {trialMax} days
                    </p>
                  </div>
                  <DayPicker
                    label="Trial days"
                    selected={pickedDays}
                    onToggle={(d) => setPickedDays((prev) => toggleTrialPick(prev, d, trialWeekdays, trialMax) as DayOfWeek[])}
                    isDisabled={(d, on) => !on && (!trialWeekdays.includes(d) || pickedDays.length >= trialMax)}
                  />
                </>
              )}
              {!(trialOpen && startDate && trialStartOk) && (
                <p className={cn("text-xs text-pretty", trialOpen && startDate ? "text-destructive" : "text-muted-foreground")}>
                  {!trialOpen
                    ? "Set a max and send days on Meal sizes → Trial before creating a trial order."
                    : !startDate
                      ? `Trials go out ${trialWeekdays.map(dayName).join(", ")}. Pick a start date.`
                      : `Start on ${(multiDayTrial ? pickedDays : trialWeekdays).map(dayName).join(" or ")}.`}
                </p>
              )}
            </fieldset>
          )}

          {eligibleAddons.length > 0 && (
            <fieldset className="space-y-3" disabled={submitting}>
              <legend className="mb-1 text-sm font-medium text-foreground">Add-ons</legend>
              <p className="text-muted-foreground text-xs">Optional. Each one is added to every tiffin and billed per tiffin.</p>
              <ul className="divide-y rounded-lg border">
                {eligibleAddons.map((addon) => {
                  const qty = qtyFor(addon.key);
                  return (
                    <li
                      key={addon.key}
                      className={cn("flex min-h-14 items-center justify-between gap-3 px-3 py-2 transition-colors", qty > 0 && "bg-primary/5")}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {addon.name}
                          {addon.portion ? <span className="text-muted-foreground font-normal"> · {addon.portion}</span> : null}
                        </p>
                        <p className="text-muted-foreground nums text-xs">
                          ${addon.pricePerTiffin.toFixed(2)} per tiffin each{qty > 0 && <> · {qty} in every tiffin</>}
                        </p>
                      </div>
                      {qty > 0 ? (
                        <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`${addon.name} quantity`}>
                          <Button type="button" variant="outline" size="icon" className="size-9" aria-label={`Remove one ${addon.name}`} onClick={() => setAddonQty(addon.key, qty - 1)}>
                            <MinusIcon className="size-4" />
                          </Button>
                          <span className="nums w-7 text-center text-sm font-medium" aria-live="polite">{qty}</span>
                          <Button type="button" variant="outline" size="icon" className="size-9" aria-label={`Add one ${addon.name}`} disabled={qty >= addon.maxQty} onClick={() => setAddonQty(addon.key, qty + 1)}>
                            <PlusIcon className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setAddonQty(addon.key, 1)}>
                          <PlusIcon className="size-4" /> Add
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}

          {!isTrial && <fieldset disabled={submitting}>
            <ScheduleSection
              frequencies={deliveryFrequencies.map((f) => ({ key: f.key, name: f.name, weekdays: f.weekdays as DayOfWeek[], savePct: f.savePct }))}
              frequencyKey={frequencyKey}
              // Delivery type only: eating days stay as chosen, so the tiffin count never changes silently.
              onFrequencyChange={(key) => form.setValue("frequencyKey", key, { shouldDirty: true, shouldValidate: true })}
              eatingDays={eatingDays}
              onToggleDay={toggleEating}
              bounds={bounds}
            />
          </fieldset>}
          {schedule && <ScheduleCard trips={schedule.trips} shifted={schedule.shifted} />}
          </FormSection>

          <FormSection hidden={page === "order"} title="Delivery" hint="Where it goes, notes for the driver, and how it's dropped off.">
          <fieldset className="space-y-4" disabled={submitting}>
            {customerCtx.addresses.length > 0 && (
              <div className="grid gap-2" role="radiogroup" aria-label="Saved addresses">
                <p className="text-sm font-medium">Saved addresses</p>
                {customerCtx.addresses.map((a) => {
                  const on = addressPublicId === a.publicId;
                  return (
                    <button
                      key={a.publicId}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => pickSavedAddress(on ? null : a.publicId)}
                      className={cn("flex items-start justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-colors", on ? "border-primary bg-primary/5" : "hover:bg-muted/40")}
                    >
                      <span className="grid gap-0.5">
                        <span className="font-medium">
                          {a.label}{a.isDefault ? <span className="text-muted-foreground font-normal"> · Default</span> : null}
                        </span>
                        <span className="text-muted-foreground">{[a.addressUnit, a.addressLine, a.city, a.postalCode].filter(Boolean).join(", ")}</span>
                        {a.deliveryInstructions ? <span className="text-muted-foreground text-xs">Notes: {a.deliveryInstructions}</span> : null}
                      </span>
                      {on && <CheckIcon className="text-primary mt-0.5 size-4 shrink-0" />}
                    </button>
                  );
                })}
                <button
                  type="button"
                  role="radio"
                  aria-checked={addressPublicId == null}
                  onClick={() => pickSavedAddress(null)}
                  className={cn("rounded-lg border p-3 text-left text-sm font-medium transition-colors", addressPublicId == null ? "border-primary bg-primary/5" : "hover:bg-muted/40")}
                >
                  A new address
                </button>
              </div>
            )}
            <fieldset className="grid gap-2" disabled={addressPublicId != null}>
              <AddressFields
                idPrefix="order"
                fields={["addressLine", "city", "postalCode"]}
                values={{ addressLine, city, postalCode }}
                onChange={(patch) => {
                  for (const key of ["addressLine", "city", "postalCode"] as const) {
                    if (patch[key] !== undefined) form.setValue(key, patch[key], { shouldDirty: true, shouldValidate: true });
                  }
                }}
                errors={{
                  addressLine: form.formState.errors.addressLine?.message,
                  city: form.formState.errors.city?.message,
                  postalCode: form.formState.errors.postalCode?.message,
                }}
                resolveUrl="/api/address/resolve"
              />
              <DeliveryAreaNote area={deliveryArea} />
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor="order-delivery-notes">Delivery notes</Label>
              <Textarea
                id="order-delivery-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={addressPublicId != null}
                placeholder="Buzzer code, leave at door, call on arrival…"
                rows={2}
                maxLength={500}
              />
              {addressPublicId != null && (
                <p className="text-muted-foreground text-xs">From the saved address. Change it on the customer&apos;s address book, or pick A new address.</p>
              )}
            </div>
            {deliveryOptions?.deliveryCharges && deliveryOptions.deliveryCharges.addressTags.length > 0 && (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Address type</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Address type">
                  {deliveryOptions.deliveryCharges.addressTags.map((tag) => (
                    <AdminPill key={tag.id} role="radio" aria-checked={addressTagId === tag.id} on={addressTagId === tag.id} onClick={() => setAddressTagId(addressTagId === tag.id ? null : tag.id)}>
                      {tag.name}
                      <span className="text-muted-foreground text-xs">{chargeHint(tag)}</span>
                    </AdminPill>
                  ))}
                </div>
              </div>
            )}
            <DropOffPicker catalog={dropOffs} value={dropOff} onChange={setDropOff} disabled={submitting} Pill={AdminPill} />
          </fieldset>
          </FormSection>

          <FormSection hidden={page === "order"} title="Payment" hint={realPayments ? "How the customer pays. Attach proof if they already paid; otherwise share the payment link after create." : undefined}>
          <fieldset className="space-y-3" disabled={submitting}>
            {realPayments ? (
              <>
                <div className="grid gap-2">
                  {paymentMethods.map((m) => {
                    const selected = m.id === paymentMethodId;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "rounded-lg border transition-colors",
                          selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setPaymentMethodId(m.id)}
                          className="flex w-full items-center justify-between gap-2 p-3 text-left"
                        >
                          <span className="font-medium">{m.label}</span>
                          {selected && <CheckIcon className="text-primary size-4" />}
                        </button>
                        {/* Outside the select button: the copy button can't nest inside it. */}
                        {selected ? (
                          <div className="grid gap-2 px-3 pb-3">
                            <PaymentInstructions payeeHandle={m.payeeHandle} instructions={m.instructions} />
                            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => void copyPaymentDetails(m)}>
                              <CopyIcon className="size-4" /> Copy payment details
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {paymentExtra?.(paymentMethodId)}
              </>
            ) : (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <ShieldCheckIcon className="size-4" /> Simulated — no real payment methods enabled.
              </p>
            )}
          </fieldset>

          {repInfo && !(repInfo.available === false && repInfo.reason === "disabled") && (
            <fieldset className="space-y-3" disabled={submitting}>
              {!discountOpen && discount === 0 ? (
                <button
                  type="button"
                  onClick={() => setDiscountOpen(true)}
                  className="text-primary hover:text-primary/80 min-h-11 text-sm font-medium underline-offset-4 hover:underline sm:min-h-0"
                >
                  {repInfo.available ? "Apply rep discount" : "Rep discount"}
                </button>
              ) : repInfo.available ? (
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{repInfo.name} <span className="nums">({repInfo.code})</span></span>
                    <span className="text-muted-foreground text-xs">
                      Up to {repInfo.capPct}% or ${repInfo.capAmount.toFixed(2)}, whichever is lower
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label htmlFor="repDiscount">Discount amount</Label>
                      <Input
                        id="repDiscount"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={ceiling}
                        step={0.01}
                        value={discount ? String(discount) : ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setDiscount(Number.isFinite(n) ? Math.max(0, Math.min(round2(n), ceiling)) : 0);
                        }}
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={() => setDiscount(ceiling)} disabled={ceiling <= 0}>Max</Button>
                    {discount > 0 && <Button type="button" variant="ghost" onClick={() => setDiscount(0)}>Clear</Button>}
                  </div>
                  <p className="text-muted-foreground text-xs nums">Ceiling for this order: ${ceiling.toFixed(2)}</p>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {repInfo.reason === "used"
                    ? "Today's coupon was already used."
                    : repInfo.reason === "expired"
                      ? "Today's coupon has expired."
                      : "No discount available today."}
                </p>
              )}
            </fieldset>
          )}

          </FormSection>

          {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}

          <div className="sticky bottom-0 -mx-4 mt-2 flex items-center justify-between gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <div className="text-sm">
              <span className="text-muted-foreground">Total </span>
              <span className="nums font-medium">{shownPreview ? `$${shownPreview.total.toFixed(2)}` : "—"}</span>
              {shownPreview ? <span className="text-muted-foreground nums"> · {shownPreview.tiffinCount} {shownPreview.tiffinCount === 1 ? "tiffin" : "tiffins"}</span> : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              {missing.length > 0 && <p className="text-muted-foreground text-xs">Still needed: {missing.join(", ")}</p>}
              {!shownPreview && previewError && missing.length === 0 && (
                <p role="alert" className="text-destructive max-w-80 text-right text-xs">{previewError}</p>
              )}
              {page === "order" ? (
                // Distinct keys: reusing one <button> lets the async click land on the new type="submit" and create the order.
                <Button key="continue" type="button" disabled={missing.length > 0} onClick={() => void continueToPayment()}>
                  Continue to payment
                </Button>
              ) : (
              <Button key="submit" type="submit" disabled={submitting || missing.length > 0 || (onReview != null && !shownPreview)}>
                {submitting ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : onReview && page !== "payment" ? (
                  "Review order"
                ) : (
                  "Create order"
                )}
              </Button>
              )}
            </div>
          </div>
        </form>
      </Form>

      <AdminOrderCreatedDialog
        open={successOpen}
        onOpenChange={(open) => {
          setSuccessOpen(open);
          if (!open && created) onCreated?.(created);
        }}
        result={created}
      />
    </>
  );
}
