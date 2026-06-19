"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PricingResult } from "@/lib/pricing";
import { reprice, validatePostal } from "@/app/(public)/subscribe/actions";
import { confirmSubscription } from "@/app/(public)/checkout/actions";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { Invoice } from "@/components/wizard/invoice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Contact = { fullName: string; phone: string; email: string; addressLine: string; city: string; postalCode: string };
const emptyContact: Contact = { fullName: "", phone: "", email: "", addressLine: "", city: "", postalCode: "" };

export function Checkout() {
  const router = useRouter();
  const [selections, setSelections] = useState<WizardSelections | null>(null);
  const [result, setResult] = useState<PricingResult | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [zone, setZone] = useState<{ served: boolean; name?: string; slotWindow?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) { router.replace("/subscribe"); return; }
    const s = JSON.parse(raw) as WizardSelections;
    // Seeding from sessionStorage, which is only readable on the client (post-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelections(s);
    reprice(s).then(setResult).catch(() => setResult(null));
  }, [router]);

  const checkPostal = async () => {
    const res = await validatePostal(contact.postalCode);
    setZone(res.served ? { served: true, name: res.zone!.name, slotWindow: res.zone!.slotWindow } : { served: false });
  };

  const set = (patch: Partial<Contact>) => setContact((c) => ({ ...c, ...patch }));

  const confirm = async () => {
    if (!selections) return;
    setSubmitting(true);
    try {
      const { deploymentId } = await confirmSubscription({ selections, planKey: selections.planKey!, contact });
      sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      router.push(`/activate/${deploymentId}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!selections) return null;

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {step === 1 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium">Address & contact</h2>
            <div className="grid gap-3">
              <div><Label htmlFor="fullName">Full name</Label><Input id="fullName" value={contact.fullName} onChange={(e) => set({ fullName: e.target.value })} /></div>
              <div><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" autoComplete="tel" value={contact.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
              <div><Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label><Input id="email" type="email" value={contact.email} onChange={(e) => set({ email: e.target.value })} /></div>
              <div><Label htmlFor="addr">Address</Label><Input id="addr" value={contact.addressLine} onChange={(e) => set({ addressLine: e.target.value })} /></div>
              <div><Label htmlFor="city">City</Label><Input id="city" value={contact.city} onChange={(e) => set({ city: e.target.value })} /></div>
              <div className="flex items-end gap-2">
                <div className="flex-1"><Label htmlFor="postal">Postal code</Label><Input id="postal" value={contact.postalCode} onChange={(e) => set({ postalCode: e.target.value })} onBlur={checkPostal} /></div>
                <Button type="button" variant="outline" onClick={checkPostal}>Check</Button>
              </div>
              {zone?.served && <p className="text-sm text-emerald-600">Served — {zone.name}, delivery {zone.slotWindow}.</p>}
              {zone && !zone.served && <p className="text-sm text-amber-600">Not yet served — you&apos;ll join the waitlist for your area.</p>}
            </div>
            <Button disabled={!contact.fullName || !contact.phone || !contact.postalCode} onClick={() => setStep(2)}>Continue to payment</Button>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <h2 className="text-lg font-medium">Payment (simulated)</h2>
            <div className="grid gap-3">
              <div><Label htmlFor="card">Card number</Label><Input id="card" inputMode="numeric" placeholder="4242 4242 4242 4242" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="exp">Expiry</Label><Input id="exp" placeholder="12/29" /></div>
                <div><Label htmlFor="cvc">CVC</Label><Input id="cvc" placeholder="123" /></div>
              </div>
              <p className="text-xs text-muted-foreground">No real charge — payment is simulated for this MVP.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button disabled={submitting} onClick={confirm}>{submitting ? "Confirming…" : "Confirm Subscription"}</Button>
            </div>
          </section>
        )}
      </div>

      <aside className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Order summary</h3>
        <Invoice result={result} />
        {zone?.served && <p className="text-xs text-muted-foreground">Delivery window: {zone.slotWindow}</p>}
      </aside>
    </div>
  );
}
