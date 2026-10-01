"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CheckIcon, Loader2Icon, ShieldCheckIcon } from "lucide-react";
import { nextWeekday } from "@foundry/commons";
import { cn } from "@foundry/ui/cn";
import { Button } from "@foundry/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { AddressFields } from "@foundry/ui/address-fields";
import { DeliveryAreaNote, useDeliveryArea } from "@/components/customer/address/delivery-area";
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
import { earliestTrialIso, trialSendDays } from "@/lib/trial/schedule";
import { convertInquiry, previewPrice, repCouponInfo, trialFormSettings, type RepCouponInfo } from "./actions";
import { ScheduleSection } from "./schedule-section";
import { PlanMealPicker } from "../../../_leads/plan-interest-fields";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// Custom meals: the server derives plan and meal size from the composition.
const customMealFormSchema = orderFormSchema.extend({ planKey: z.string(), mealSizeId: z.string() });

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string; trial?: boolean; servesWeekends?: boolean }[];
  frequencies: { key: string; name: string; weekdays?: string[] | null; savePct?: number }[];
  minTiffinsPerWeek?: number;
  maxTiffinsPerWeek?: number;
  durations: { weeks: number }[];
};

type EnabledSlot = { key: string; label: string };

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
  hideMealSizePicker = false,
  customMeal = null,
}: {
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
  const [paymentMethods, setPaymentMethods] = useState<CheckoutPaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminOrderCreated | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [trialSettings, setTrialSettings] = useState<{ maxDays: number | null; weekdays: string[] } | null>(null);
  const [trialDays, setTrialDays] = useState(1);

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
  // Trial send days for this meal: no Sat/Sun when it has no weekend dish.
  const trialWeekdays = trialSettings ? trialSendDays(trialSettings.weekdays, selectedSize?.servesWeekends ?? true) : [];
  const trialOpen = isTrial && trialSettings?.maxDays != null && trialSettings.maxDays >= 1 && trialWeekdays.length > 0;
  const minStart = isTrial && trialSettings
    ? earliestTrialIso(new Date(), trialWeekdays)
    : nextWeekday(new Date()).toISOString().slice(0, 10);
  const realPayments = paymentMethods.length > 0;
  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId) ?? null;

  useEffect(() => {
    if (!mealSizeId) return;
    if (mealsForPlan.some((m) => m.id === mealSizeId)) return;
    form.setValue("mealSizeId", mealsForPlan[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);

  useEffect(() => {
    let cancelled = false;
    trialFormSettings()
      .then((s) => {
        if (cancelled) return;
        setTrialSettings(s);
        if (s.maxDays != null && s.maxDays >= 1) setTrialDays(s.maxDays);
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
      frequencyKey: v.frequencyKey,
      eatingDays: trial ? undefined : v.eatingDays,
      persons: v.persons,
      mealSlots: v.mealSlots,
      includeSaturday: trial ? false : v.eatingDays.includes("sat"),
      includeSunday: trial ? false : v.eatingDays.includes("sun"),
      durationWeeks: v.durationWeeks,
      startDate: v.startDate,
      ...(trial ? { trialDays } : {}),
    },
    contact: {
      fullName: contact.fullName,
      phone: contact.phone,
      email: v.email,
      addressLine: v.addressLine,
      city: v.city,
      postalCode: v.postalCode,
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
    // email/addressLine/city/postalCode intentionally excluded — they don't affect
    // pricing and are per-keystroke, so including them would refire preview on every
    // character typed. contact.fullName/phone are included since buildInput reads
    // them (stale otherwise if a future field starts depending on them for price).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, mealSizeId, frequencyKey, eatingDays, persons, mealSlots, durationWeeks, startDate, discount, repInfo, paymentMethodId, contact.fullName, contact.phone, hideMealSizePicker, customKey, trialDays, isTrial]);

  useEffect(() => {
    if (discount > ceiling) setDiscount(ceiling);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceiling]);

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    if (isTrial && !trialOpen) {
      setError("Trials aren't available right now");
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

  const missing = [
    hideMealSizePicker ? !customKey && "custom meal items" : !mealSizeId && "meal size",
    !startDate && "start date",
    !addressLine && "address",
    !city && "city",
    !postalCode && "postal code",
    realPayments && !paymentMethodId && "payment method",
  ].filter(Boolean) as string[];

  return (
    <>
      <Form {...form}>
        <form onSubmit={onSubmit} className="relative space-y-6">
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

          <fieldset className="space-y-3" disabled={submitting}>
            <legend className="text-sm font-medium text-foreground mb-1">Plan & Schedule</legend>
            <div className="grid gap-4 sm:grid-cols-2">
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
              {!hideMealSizePicker && (
                <div className="sm:col-span-2 grid gap-4">
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
              {isTrial ? (
                <div className="space-y-2">
                  <Label htmlFor="trial-days">Trial days <span className="text-destructive">*</span></Label>
                  <Input
                    id="trial-days"
                    type="number"
                    min={1}
                    max={trialSettings?.maxDays ?? 1}
                    value={trialDays}
                    onChange={(e) => setTrialDays(Math.min(trialSettings?.maxDays ?? 1, Math.max(1, Number(e.target.value) || 1)))}
                  />
                  <p className="text-muted-foreground text-xs">
                    {trialOpen
                      ? `Up to ${trialSettings?.maxDays} days, sent on ${trialWeekdays.join(", ")}.`
                      : "Set a max and send days on Meal sizes → Trial before creating a trial order."}
                  </p>
                </div>
              ) : (
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </fieldset>

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

          <fieldset className="space-y-3" disabled={submitting}>
            <legend className="text-sm font-medium text-foreground mb-1">Delivery</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 grid gap-2">
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
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={submitting}>
            <legend className="mb-1 text-sm font-medium text-foreground">Payment</legend>
            {realPayments ? (
              <>
                <p className="text-muted-foreground text-xs">
                  Choose how the customer will pay. Share the payment link after create so they can complete it.
                </p>
                <div className="grid gap-2">
                  {paymentMethods.map((m) => {
                    const selected = m.id === paymentMethodId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethodId(m.id)}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{m.label}</span>
                          {selected && <CheckIcon className="text-primary size-4" />}
                        </div>
                        {selected && (m.payeeHandle || m.instructions) && (
                          <div className="text-muted-foreground mt-2 space-y-1 text-sm">
                            {m.payeeHandle && (
                              <p>
                                Send to: <span className="text-foreground font-medium">{m.payeeHandle}</span>
                              </p>
                            )}
                            {m.instructions && <p className="whitespace-pre-wrap">{m.instructions}</p>}
                          </div>
                        )}
                      </button>
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
              <legend className="text-sm font-medium text-foreground mb-1">Rep discount</legend>
              {repInfo.available ? (
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

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          {selectedMethod && (
            <p className="bg-muted/50 text-muted-foreground rounded-lg p-3 text-xs">
              After create, copy the customer payment link and ask them to complete{" "}
              {selectedMethod.label}. Deliveries start once payment is confirmed.
            </p>
          )}

          <div className="sticky bottom-0 -mx-4 mt-2 flex items-center justify-between gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <div className="text-sm">
              <span className="text-muted-foreground">Total </span>
              <span className="nums font-medium">{shownPreview ? `$${shownPreview.total.toFixed(2)}` : "—"}</span>
              {shownPreview ? <span className="text-muted-foreground nums"> · {shownPreview.tiffinCount} tiffins</span> : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              {missing.length > 0 && <p className="text-muted-foreground text-xs">Missing: {missing.join(", ")}</p>}
              {!shownPreview && previewError && missing.length === 0 && (
                <p role="alert" className="text-destructive max-w-80 text-right text-xs">{previewError}</p>
              )}
              <Button type="submit" disabled={submitting || missing.length > 0 || (onReview != null && !shownPreview)}>
                {submitting ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Creating…
                  </>
                ) : onReview ? (
                  "Review order"
                ) : (
                  "Create order"
                )}
              </Button>
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
