"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Country } from "react-phone-number-input";
import { PhoneInput } from "@realm/ui/phone-input";
import type { PricingResult } from "@/lib/pricing";
import { reprice, validatePostal, type AppliedCoupon } from "@/app/(public)/subscribe/actions";
import { confirmSubscription } from "@/app/(public)/checkout/actions";
import { createWebsiteInquiry } from "@/app/(marketing)/contact/actions";
import { toast } from "sonner";
import { emailSchema, phoneSchema } from "@realm/commons";
import { WIZARD_STORAGE_KEY, type WizardSelections } from "@/components/wizard/selections";
import { Invoice } from "@/components/wizard/invoice";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Card } from "@realm/design-system";
import { Check, MapPin, ShieldCheck, Tag } from "lucide-react";

type Contact = { fullName: string; phone: string; email: string; addressLine: string; city: string; postalCode: string };
const emptyContact: Contact = { fullName: "", phone: "", email: "", addressLine: "", city: "", postalCode: "" };

export function Checkout({ defaultCountry }: { defaultCountry: Country }) {
  const router = useRouter();
  const [selections, setSelections] = useState<WizardSelections | null>(null);
  const [result, setResult] = useState<PricingResult | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [contact, setContact] = useState<Contact>(emptyContact);
  const [zone, setZone] = useState<{ served: boolean; name?: string; slotWindow?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedCoupon[]>([]);
  const [couponState, setCouponState] = useState<{ status: "idle" | "checking" | "applied" | "error"; message?: string }>({ status: "idle" });
  const [waitlisted, setWaitlisted] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) { router.replace("/subscribe"); return; }
    const s = JSON.parse(raw) as WizardSelections;
    // Seeding from sessionStorage, which is only readable on the client (post-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelections(s);
    reprice(s, undefined, s.planKey ?? undefined)
      .then((r) => { setResult(r.pricing); setApplied(r.appliedCoupons); })
      .catch(() => setResult(null));
  }, [router]);

  const checkPostal = async () => {
    const res = await validatePostal(contact.postalCode);
    setZone(res.served ? { served: true, name: res.zone!.name, slotWindow: res.zone!.slotWindow } : { served: false });
  };

  const set = (patch: Partial<Contact>) => setContact((c) => ({ ...c, ...patch }));

  const joinWaitlist = async () => {
    try {
      await createWebsiteInquiry({
        fullName: contact.fullName,
        phone: contact.phone,
        email: contact.email || undefined,
        postalCode: contact.postalCode,
      });
      setWaitlisted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join the waitlist.");
    }
  };

  const applyCoupon = async () => {
    if (!selections) return;
    const code = couponCode.trim();
    setCouponState({ status: code ? "checking" : "idle" });
    const r = await reprice(selections, code || undefined, selections.planKey ?? undefined);
    setResult(r.pricing);
    setApplied(r.appliedCoupons);
    if (!code) {
      setAppliedCode(null);
      setCouponState({ status: "idle" });
      return;
    }
    if (r.couponError) {
      setAppliedCode(null);
      setCouponState({ status: "error", message: r.couponError });
      return;
    }
    // The manual code is honored only if it landed in the winning set — a better
    // auto-apply combo can beat it, in which case the auto set still applies.
    const inSet = r.appliedCoupons.some((c) => c.code.toUpperCase() === code.toUpperCase());
    setAppliedCode(inSet ? code : null);
    setCouponState({
      status: "applied",
      message: inSet ? "Coupon applied" : "A better discount is already applied",
    });
  };

  const confirm = async () => {
    if (!selections) return;
    setSubmitting(true);
    try {
      const { deploymentId } = await confirmSubscription({
        selections,
        planKey: selections.planKey!,
        contact,
        couponCode: appliedCode ?? undefined,
      });
      sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      router.push(`/activate/${deploymentId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!selections) return null;

  const phoneValid = phoneSchema().safeParse(contact.phone.trim()).success;
  const emailValid = !contact.email.trim() || emailSchema.safeParse(contact.email).success;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_360px] md:items-start">
      <div className="space-y-5">
        <ol className="flex items-center gap-2 text-xs font-medium">
          {(["Address & contact", "Payment"] as const).map((label, i) => {
            const n = (i + 1) as 1 | 2;
            const done = step > n;
            const current = step === n;
            return (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-[11px] transition-colors ${
                    done || current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="size-3" /> : n}
                </span>
                <span className={current ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                {i === 0 && <span aria-hidden className="mx-1 h-px w-6 bg-border" />}
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <Card variant="glow" className="p-5 sm:p-6">
            <section className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-balance">Address &amp; contact</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Where should we deliver your tiffins?</p>
              </div>
              <div className="grid gap-4">
                <div className="grid gap-1.5"><Label htmlFor="fullName">Full name</Label><Input id="fullName" autoComplete="name" value={contact.fullName} onChange={(e) => set({ fullName: e.target.value })} /></div>
                <div className="grid gap-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <PhoneInput id="phone" autoComplete="tel" value={contact.phone} onChange={(v) => set({ phone: v ?? "" })} defaultCountry={defaultCountry} />
                  {contact.phone.trim() && !phoneValid && <p className="text-xs text-destructive">Enter a valid phone number</p>}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="email" type="email" autoComplete="email" value={contact.email} onChange={(e) => set({ email: e.target.value })} />
                  {contact.email.trim() && !emailValid && <p className="text-xs text-destructive">Enter a valid email</p>}
                </div>
                <div className="grid gap-1.5"><Label htmlFor="addr">Address</Label><Input id="addr" autoComplete="address-line1" value={contact.addressLine} onChange={(e) => set({ addressLine: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label htmlFor="city">City</Label><Input id="city" autoComplete="address-level2" value={contact.city} onChange={(e) => set({ city: e.target.value })} /></div>
                <div className="flex items-end gap-2">
                  <div className="grid flex-1 gap-1.5"><Label htmlFor="postal">Postal code</Label><Input id="postal" autoComplete="postal-code" value={contact.postalCode} onChange={(e) => set({ postalCode: e.target.value })} onBlur={checkPostal} /></div>
                  <Button type="button" variant="outline" onClick={checkPostal}>Check</Button>
                </div>
                {zone?.served && (
                  <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    <span>Served — {zone.name}, delivery {zone.slotWindow}.</span>
                  </div>
                )}
                {zone && !zone.served && !waitlisted && (
                  <div className="space-y-2 rounded-lg bg-amber-500/10 p-3">
                    <p className="text-sm text-amber-700 dark:text-amber-400">Not in your area yet.</p>
                    <Button type="button" variant="outline" disabled={!contact.fullName || !phoneValid} onClick={joinWaitlist}>Join waitlist</Button>
                  </div>
                )}
                {waitlisted && (
                  <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                    <Check className="mt-0.5 size-4 shrink-0" />
                    <span>You&apos;re on the waitlist — we&apos;ll email you when we reach your area.</span>
                  </div>
                )}
              </div>
              <Button size="lg" className="w-full sm:w-auto" disabled={!contact.fullName || !phoneValid || !emailValid || !contact.postalCode || (zone != null && !zone.served)} onClick={() => setStep(2)}>Continue to payment</Button>
            </section>
          </Card>
        )}

        {step === 2 && (
          <Card variant="glow" className="p-5 sm:p-6">
            <section className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-balance">Payment</h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ShieldCheck className="size-4" /> Simulated — no real charge for this MVP.
                </p>
              </div>
              <div className="grid gap-4">
                <div className="grid gap-1.5"><Label htmlFor="card">Card number</Label><Input id="card" inputMode="numeric" className="nums" placeholder="4242 4242 4242 4242" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5"><Label htmlFor="exp">Expiry</Label><Input id="exp" className="nums" placeholder="12/29" /></div>
                  <div className="grid gap-1.5"><Label htmlFor="cvc">CVC</Label><Input id="cvc" className="nums" placeholder="123" /></div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button size="lg" className="flex-1 sm:flex-none" disabled={submitting} onClick={confirm}>{submitting ? "Confirming…" : "Confirm Subscription"}</Button>
              </div>
            </section>
          </Card>
        )}
      </div>

      <aside className="space-y-3 md:sticky md:top-6">
        <Card variant="glow" className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Order summary</h3>
          <Invoice result={result} />
          {applied.length > 0 && (
            <ul className="grid gap-1.5 rounded-lg bg-muted/50 p-3 text-xs">
              {applied.map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono">{c.code}</span>
                    <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {c.auto ? "Auto-applied" : "Entered"}
                    </span>
                  </span>
                  <span className="nums text-emerald-600 dark:text-emerald-400">−${c.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-lg bg-muted/50 p-3">
            <Label htmlFor="coupon" className="flex items-center gap-1.5 text-xs text-muted-foreground"><Tag className="size-3.5" /> Coupon code</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="coupon"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value); if (couponState.status !== "idle") setCouponState({ status: "idle" }); }}
                placeholder="e.g. SAVE10"
                autoCapitalize="characters"
              />
              <Button type="button" variant="outline" onClick={applyCoupon} disabled={couponState.status === "checking"}>
                {couponState.status === "checking" ? "Checking…" : "Apply"}
              </Button>
            </div>
            {couponState.status === "applied" && <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">{couponState.message}</p>}
            {couponState.status === "error" && <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">{couponState.message}</p>}
          </div>
          {zone?.served && <p className="text-xs text-muted-foreground">Delivery window: {zone.slotWindow}</p>}
        </Card>
      </aside>
    </div>
  );
}
