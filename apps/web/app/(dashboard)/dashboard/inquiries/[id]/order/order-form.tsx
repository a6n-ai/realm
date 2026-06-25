"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { nextWeekday } from "@tiffin/commons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PricingResult } from "@/lib/pricing";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import { orderFormSchema, type OrderFormInput, type OrderFormValues } from "../order-schema";
import { convertInquiry, previewPrice } from "./actions";

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
}: {
  inquiryId: string;
  contact: { fullName: string; phone: string; email: string };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
  prefill?: Partial<OrderFormInput>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PricingResult | null>(null);

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
  });

  useEffect(() => {
    if (!mealSizeId || !planKey) return;
    let cancelled = false;
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
    )
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, mealSizeId, frequencyKey, persons, mealSlots, includeSaturday, includeSunday, durationWeeks, startDate]);

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await convertInquiry(inquiryId, buildInput(v));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create order");
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-6 md:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Plan</Label>
            <Select value={planKey} onValueChange={(v) => form.setValue("planKey", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{catalog.plans.map((p) => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Meal size</Label>
            <Select value={mealSizeId} onValueChange={(v) => form.setValue("mealSizeId", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{catalog.mealSizes.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.diet})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Frequency</Label>
            <Select value={frequencyKey} onValueChange={(v) => form.setValue("frequencyKey", v as "5_day" | "mwf")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{catalog.frequencies.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="qty">Persons</Label>
            <Input id="qty" type="number" min={1} max={5} {...form.register("persons")} />
          </div>
          <div>
            <Label>Duration (weeks)</Label>
            <Select value={String(durationWeeks)} onValueChange={(v) => form.setValue("durationWeeks", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{catalog.durations.map((d) => <SelectItem key={d.weeks} value={String(d.weeks)}>{d.weeks}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="start-date">Start date</Label>
            <Input id="start-date" type="date" min={minStart} {...form.register("startDate")} />
          </div>
        </div>

        {enabledSlots.length > 0 && (
          <div className="space-y-2">
            <Label>Meal slots</Label>
            <div className="flex flex-wrap gap-4">
              {enabledSlots.map((slot) => (
                <label key={slot.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label><Input id="email" type="email" {...form.register("email")} /></div>
          <div><Label htmlFor="addr">Address</Label><Input id="addr" {...form.register("addressLine")} /></div>
          <div><Label htmlFor="city">City</Label><Input id="city" {...form.register("city")} /></div>
          <div><Label htmlFor="postal">Postal code</Label><Input id="postal" {...form.register("postalCode")} /></div>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button type="submit" disabled={form.formState.isSubmitting || !startDate || !addressLine || !city || !postalCode}>Create order &amp; convert</Button>
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
  );
}
