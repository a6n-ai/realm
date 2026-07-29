"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckIcon, Loader2Icon, ShieldCheckIcon } from "lucide-react";
import { nextWeekday } from "@realm/commons";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { Switch } from "@realm/ui/switch";
import type { PricingResult } from "@/lib/pricing";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import type { ZoneLike } from "@/lib/catalog/postal";
import {
  listCheckoutPaymentMethods,
  type CheckoutPaymentMethod,
} from "@/app/(public)/subscribe/actions";
import {
  AdminOrderCreatedDialog,
  type AdminOrderCreated,
} from "@/app/(dashboard)/dashboard/orders/admin-order-created-dialog";
import { orderFormSchema, type OrderFormInput, type OrderFormValues } from "../order-schema";
import { convertInquiry, previewPrice, repCouponInfo, type RepCouponInfo } from "./actions";
import { PostalCombobox } from "../../../_leads/postal-combobox";
import { PlanMealPicker } from "../../../_leads/plan-interest-fields";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

type Catalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string; diet: string }[];
  frequencies: { key: string; name: string }[];
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
  zones,
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
  zones?: ZoneLike[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PricingResult | null>(null);
  const [repInfo, setRepInfo] = useState<RepCouponInfo | null>(null);
  const [discount, setDiscount] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<CheckoutPaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [created, setCreated] = useState<AdminOrderCreated | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const defaultSlots = enabledSlots.some((s) => s.key === "lunch")
    ? ["lunch"]
    : enabledSlots.slice(0, 1).map((s) => s.key);

  const form = useForm<OrderFormInput, unknown, OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      planKey: "",
      mealSizeId: "",
      frequencyKey: "5_day",
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
  const minStart = nextWeekday(new Date()).toISOString().slice(0, 10);

  const planKey = form.watch("planKey");
  const mealSizeId = form.watch("mealSizeId");
  const frequencyKey = form.watch("frequencyKey");
  const persons = form.watch("persons");
  const mealSlots = form.watch("mealSlots");
  const includeSaturday = form.watch("includeSaturday");
  const includeSunday = form.watch("includeSunday");
  const durationWeeks = form.watch("durationWeeks");
  const startDate = form.watch("startDate");
  const addressLine = form.watch("addressLine");
  const city = form.watch("city");
  const postalCode = form.watch("postalCode");
  const email = form.watch("email");

  const mealsForPlan = catalog.mealSizes.filter((m) => !planKey || m.diet === planKey);
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

  const buildInput = (v: OrderFormValues): CreateOrderInput => ({
    planKey: v.planKey,
    selections: {
      mealSizeId: v.mealSizeId,
      frequencyKey: v.frequencyKey,
      persons: v.persons,
      mealSlots: v.mealSlots,
      includeSaturday: v.includeSaturday,
      includeSunday: v.includeSunday,
      durationWeeks: v.durationWeeks,
      startDate: v.startDate,
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
  });

  const subtotal = preview?.subtotal ?? 0;
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
    const repCode = repInfo?.available ? repInfo.code : undefined;
    previewPrice(
      buildInput({
        planKey,
        mealSizeId,
        frequencyKey,
        persons: Number(persons),
        mealSlots,
        includeSaturday,
        includeSunday,
        durationWeeks: Number(durationWeeks),
        startDate,
        email: email ?? "",
        addressLine: addressLine ?? "",
        city: city ?? "",
        postalCode: postalCode ?? "",
      }),
      repCode,
      discount > 0 ? discount : undefined,
    )
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, mealSizeId, frequencyKey, persons, mealSlots, includeSaturday, includeSunday, durationWeeks, startDate, discount, repInfo, paymentMethodId]);

  useEffect(() => {
    if (discount > ceiling) setDiscount(ceiling);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceiling]);

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    if (realPayments && !paymentMethodId) {
      setError("Choose a payment method");
      return;
    }
    try {
      const orderInput = buildInput(v);
      const result = onCreate
        ? await onCreate(orderInput)
        : await convertInquiry(inquiryId, orderInput);
      setCreated(result);
      setSuccessOpen(true);
      // Do not call onCreated here — closing a parent sheet would unmount this dialog.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create order");
    }
  });

  const missing = [
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
              <FormField
                control={form.control}
                name="frequencyKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency <span className="text-destructive">*</span></FormLabel>
                    <Select value={field.value} onValueChange={(v) => field.onChange(v as "5_day" | "mwf")}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{catalog.frequencies.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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

          <fieldset className="space-y-3" disabled={submitting}>
            <legend className="text-sm font-medium text-foreground mb-1">Meal Options</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><Switch checked={includeSaturday} onCheckedChange={(c) => form.setValue("includeSaturday", c)} /> Saturday</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={includeSunday} onCheckedChange={(c) => form.setValue("includeSunday", c)} /> Sunday</label>
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={submitting}>
            <legend className="text-sm font-medium text-foreground mb-1">Delivery</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="addressLine"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Address <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal code <span className="text-destructive">*</span></FormLabel>
                    {zones && zones.length > 0 ? (
                      <PostalCombobox value={field.value} onChange={field.onChange} zones={zones} />
                    ) : (
                      <FormControl><Input {...field} /></FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <span className="nums font-medium">{preview ? `$${preview.total.toFixed(2)}` : "—"}</span>
              {preview ? <span className="text-muted-foreground nums"> · {preview.tiffinCount} tiffins</span> : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              {missing.length > 0 && <p className="text-muted-foreground text-xs">Missing: {missing.join(", ")}</p>}
              <Button type="submit" disabled={submitting || missing.length > 0}>
                {submitting ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Creating…
                  </>
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
