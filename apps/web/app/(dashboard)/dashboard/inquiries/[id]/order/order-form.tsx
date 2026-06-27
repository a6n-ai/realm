"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { nextWeekday } from "@tiffin/commons";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PricingResult } from "@/lib/pricing";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import { orderFormSchema, type OrderFormInput, type OrderFormValues } from "../order-schema";
import { convertInquiry, previewPrice, repCouponInfo, type RepCouponInfo } from "./actions";

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
}: {
  inquiryId: string;
  contact: { fullName: string; phone: string; email: string };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  prefill?: Partial<OrderFormInput>;
  onCreate?: (order: CreateOrderInput) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PricingResult | null>(null);
  // The acting rep's own daily coupon (server-discovered) and the clamped amount
  // they choose to apply. The amount is bounded by a server-computed ceiling — it
  // is never a free-text discount (createOrder re-validates and clamps again).
  const [repInfo, setRepInfo] = useState<RepCouponInfo | null>(null);
  const [discount, setDiscount] = useState(0);

  const defaultSlots = enabledSlots.some((s) => s.key === "lunch")
    ? ["lunch"]
    : enabledSlots.slice(0, 1).map((s) => s.key);

  const form = useForm<OrderFormInput, unknown, OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      planKey: catalog.plans[0]?.key ?? "",
      mealSizeId: catalog.mealSizes[0]?.id ?? "",
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
      email: v.email || undefined,
      addressLine: v.addressLine,
      city: v.city,
      postalCode: v.postalCode,
    },
    repCoupon: repInfo?.available && discount > 0
      ? { code: repInfo.code, requestedAmount: discount }
      : undefined,
  });

  // Server-side ceiling for the rep discount: the lower of (cap% of subtotal, cap$).
  // The number input is bounded by this — the rep can never type past it.
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
  }, [planKey, mealSizeId, frequencyKey, persons, mealSlots, includeSaturday, includeSunday, durationWeeks, startDate, discount, repInfo]);

  useEffect(() => {
    // Keep the chosen discount within the live ceiling as the subtotal changes.
    if (discount > ceiling) setDiscount(ceiling);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceiling]);

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const orderInput = buildInput(v);
      if (onCreate) {
        await onCreate(orderInput);
        return;
      }
      await convertInquiry(inquiryId, orderInput);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create order");
    }
  });

  const missing = [
    !startDate && "start date",
    !addressLine && "address",
    !city && "city",
    !postalCode && "postal code",
  ].filter(Boolean) as string[];

  return (
    <Form {...form}>
    <form onSubmit={onSubmit} className="grid gap-6 md:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground mb-1">Plan & Schedule</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="planKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Plan <span className="text-destructive">*</span></FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>{catalog.plans.map((p) => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mealSizeId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meal size <span className="text-destructive">*</span></FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>{catalog.mealSizes.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.diet})</SelectItem>)}</SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
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

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground mb-1">Meal Options</legend>
        {enabledSlots.length > 0 && (
          <div className="space-y-2">
            <Label>Meal slots</Label>
            <div className="flex flex-wrap gap-4">
              {enabledSlots.map((slot) => (
                <label key={slot.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[var(--brand)] size-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                    checked={mealSlots.includes(slot.key)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...mealSlots, slot.key]
                        : mealSlots.filter((k) => k !== slot.key);
                      if (next.length > 0) form.setValue("mealSlots", next);
                    }}
                  />
                  {slot.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm"><Switch checked={includeSaturday} onCheckedChange={(c) => form.setValue("includeSaturday", c)} /> Saturday</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={includeSunday} onCheckedChange={(c) => form.setValue("includeSunday", c)} /> Sunday</label>
        </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground mb-1">Delivery</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label><Input id="email" type="email" {...form.register("email")} /></div>
          <FormField
            control={form.control}
            name="addressLine"
            render={({ field }) => (
              <FormItem>
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
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        </fieldset>

        {repInfo && !(repInfo.available === false && repInfo.reason === "disabled") && (
          <fieldset className="space-y-3">
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

        <div className="sticky bottom-0 -mx-4 mt-2 flex items-center justify-between gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="text-sm">
            <span className="text-muted-foreground">Total </span>
            <span className="nums font-medium">{preview ? `$${preview.total.toFixed(2)}` : "—"}</span>
            {preview ? <span className="text-muted-foreground nums"> · {preview.tiffinCount} tiffins</span> : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            {missing.length > 0 && <p className="text-muted-foreground text-xs">Missing: {missing.join(", ")}</p>}
            <Button type="submit" disabled={form.formState.isSubmitting || missing.length > 0}>Create order &amp; convert</Button>
          </div>
        </div>
      </div>

      <aside className="h-fit rounded-lg border p-4 text-sm">
        <h2 className="mb-2 font-medium">Invoice</h2>
        {preview ? (
          <div className="space-y-1">
            {preview.lineItems.map((l) => (
              <div key={l.label} className="flex justify-between"><span className="text-muted-foreground">{l.label}</span><span className="nums">${l.amount.toFixed(2)}</span></div>
            ))}
            {preview.adjustments.map((d) => (
              <div key={d.label} className="flex justify-between text-emerald-600"><span>{d.label}</span><span className="nums">-${d.amount.toFixed(2)}</span></div>
            ))}
            <div className="mt-2 flex justify-between border-t pt-2 font-medium"><span>Total ({preview.tiffinCount} tiffins)</span><span className="nums">${preview.total.toFixed(2)}</span></div>
          </div>
        ) : (
          <p className="text-muted-foreground">Select options to preview.</p>
        )}
      </aside>
    </form>
    </Form>
  );
}
