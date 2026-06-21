"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PricingResult } from "@/lib/pricing";
import type { CreateOrderInput } from "@/lib/services/orders.service";
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
}: {
  inquiryId: string;
  contact: { fullName: string; phone: string; email: string };
  catalog: Catalog;
  enabledSlots: EnabledSlot[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PricingResult | null>(null);

  const [planKey, setPlanKey] = useState(catalog.plans[0]?.key ?? "");
  const [mealSizeId, setMealSizeId] = useState(catalog.mealSizes[0]?.id ?? "");
  const [frequencyKey, setFrequencyKey] = useState<"5_day" | "mwf">("5_day");
  const [persons, setPersons] = useState(1);
  const [mealSlots, setMealSlots] = useState<string[]>(
    enabledSlots.some((s) => s.key === "lunch") ? ["lunch"] : enabledSlots.slice(0, 1).map((s) => s.key),
  );
  const [includeSaturday, setSat] = useState(false);
  const [includeSunday, setSun] = useState(false);
  const [durationWeeks, setDuration] = useState(catalog.durations[0]?.weeks ?? 1);

  const [addr, setAddr] = useState({ addressLine: "", city: "", postalCode: "" });
  const [email, setEmail] = useState(contact.email);

  const buildInput = (): CreateOrderInput => ({
    planKey,
    selections: { mealSizeId, frequencyKey, persons, mealSlots, includeSaturday, includeSunday, durationWeeks, startDate: "" },
    contact: {
      fullName: contact.fullName,
      phone: contact.phone,
      email: email || undefined,
      addressLine: addr.addressLine,
      city: addr.city,
      postalCode: addr.postalCode,
    },
  });

  useEffect(() => {
    if (!mealSizeId || !planKey) return;
    let cancelled = false;
    previewPrice(buildInput())
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, mealSizeId, frequencyKey, persons, mealSlots, includeSaturday, includeSunday, durationWeeks]);

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        await convertInquiry(inquiryId, buildInput());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create order");
      }
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Plan</Label>
            <Select value={planKey} onValueChange={setPlanKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{catalog.plans.map((p) => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Meal size</Label>
            <Select value={mealSizeId} onValueChange={setMealSizeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{catalog.mealSizes.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.diet})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Frequency</Label>
            <Select value={frequencyKey} onValueChange={(v) => setFrequencyKey(v as "5_day" | "mwf")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{catalog.frequencies.map((f) => <SelectItem key={f.key} value={f.key}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="qty">Persons</Label>
            <Input id="qty" type="number" min={1} max={5} value={persons} onChange={(e) => setPersons(Number(e.target.value))} />
          </div>
          <div>
            <Label>Duration (weeks)</Label>
            <Select value={String(durationWeeks)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{catalog.durations.map((d) => <SelectItem key={d.weeks} value={String(d.weeks)}>{d.weeks}</SelectItem>)}</SelectContent>
            </Select>
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
                    onChange={(e) =>
                      setMealSlots((prev) => {
                        const next = e.target.checked ? [...prev, slot.key] : prev.filter((k) => k !== slot.key);
                        return next.length === 0 ? prev : next;
                      })
                    }
                  />
                  {slot.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm"><Switch checked={includeSaturday} onCheckedChange={setSat} /> Saturday</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={includeSunday} onCheckedChange={setSun} /> Sunday</label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="addr">Address</Label><Input id="addr" value={addr.addressLine} onChange={(e) => setAddr((a) => ({ ...a, addressLine: e.target.value }))} /></div>
          <div><Label htmlFor="city">City</Label><Input id="city" value={addr.city} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} /></div>
          <div><Label htmlFor="postal">Postal code</Label><Input id="postal" value={addr.postalCode} onChange={(e) => setAddr((a) => ({ ...a, postalCode: e.target.value }))} /></div>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button onClick={submit} disabled={pending || !addr.addressLine || !addr.city || !addr.postalCode}>Create order &amp; convert</Button>
      </div>

      <aside className="h-fit rounded-lg border p-4 text-sm">
        <h2 className="mb-2 font-medium">Invoice</h2>
        {preview ? (
          <div className="space-y-1">
            {preview.lineItems.map((l) => (
              <div key={l.label} className="flex justify-between"><span className="text-muted-foreground">{l.label}</span><span>${l.amount.toFixed(2)}</span></div>
            ))}
            {preview.adjustments.map((d) => (
              <div key={d.label} className="flex justify-between text-emerald-600"><span>{d.label}</span><span>-${d.amount.toFixed(2)}</span></div>
            ))}
            <div className="mt-2 flex justify-between border-t pt-2 font-medium"><span>Total ({preview.tiffinCount} tiffins)</span><span>${preview.total.toFixed(2)}</span></div>
          </div>
        ) : (
          <p className="text-muted-foreground">Select options to preview.</p>
        )}
      </aside>
    </div>
  );
}
