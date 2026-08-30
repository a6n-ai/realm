"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Country } from "react-phone-number-input";
import { PhoneInput } from "@realm/ui/phone-input";
import type { PricingResult } from "@/lib/pricing";
import {
  reprice,
  validatePostal,
  type AppliedCoupon,
  type CheckoutPaymentMethod,
} from "@/app/(public)/subscribe/actions";
import { confirmSubscription } from "@/app/(public)/checkout/actions";
import { createWebsiteInquiry } from "@/app/(marketing)/contact/actions";
import { toast } from "sonner";
import { emailSchema, phoneSchema } from "@realm/commons";
import { WIZARD_ORIGIN_KEY, WIZARD_STORAGE_KEY, type WizardOrigin, type WizardSelections } from "@/components/wizard/selections";
import { Invoice } from "@/components/wizard/invoice";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { AddressFields } from "@realm/ui/address-fields";
import { Card } from "@/components/ds";
import { cn } from "@realm/ui/cn";
import { Check, Coins, MapPin, ShieldCheck, Tag } from "lucide-react";
import { Stepper } from "@/components/stepper";
import { StatusBanner, toneClasses } from "@/components/checkout/status-banner";

const CHECKOUT_STEPS = ["Address & contact", "Payment"] as const;

type Contact = {
  fullName: string;
  phone: string;
  email: string;
  addressLine: string;
  city: string;
  postalCode: string;
};
const emptyContact: Contact = { fullName: "", phone: "", email: "", addressLine: "", city: "", postalCode: "" };

export function Checkout({
  defaultCountry,
  closeHref = "/me",
  prefill,
}: {
  defaultCountry: Country;
  closeHref?: string;
  prefill?: Partial<Contact>;
}) {
  const router = useRouter();
  const [selections, setSelections] = useState<WizardSelections | null>(null);
  const [result, setResult] = useState<PricingResult | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [contact, setContact] = useState<Contact>({ ...emptyContact, ...prefill });
  const [zone, setZone] = useState<{ served: boolean; name?: string; slotWindow?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedCoupon[]>([]);
  const [couponState, setCouponState] = useState<{ status: "idle" | "checking" | "applied" | "error"; message?: string }>({ status: "idle" });
  const [coinsInput, setCoinsInput] = useState("");
  const [appliedCoins, setAppliedCoins] = useState(0);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [coinsState, setCoinsState] = useState<{ status: "idle" | "checking" | "applied" | "error"; message?: string }>({ status: "idle" });
  const [waitlisted, setWaitlisted] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<CheckoutPaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  // Where "Edit plan" sends the customer back to — the flow that actually wrote
  // WIZARD_STORAGE_KEY, not always the full wizard.
  const [origin, setOrigin] = useState<WizardOrigin>("subscribe");

  const refreshPrice = async (
    s: WizardSelections,
    code: string | undefined,
    methodId: string | null,
    coins?: number,
  ) => {
    const r = await reprice(s, code, s.planKey ?? undefined, methodId, coins);
    setResult(r.pricing);
    setApplied(r.appliedCoupons);
    setPaymentMethods(r.paymentMethods);
    setCoinBalance(r.coinBalance);
    // Auto-pick the first enabled method when none chosen yet.
    if (!methodId && r.paymentMethods.length > 0) {
      setPaymentMethodId(r.paymentMethods[0]!.id);
      return refreshPrice(s, code, r.paymentMethods[0]!.id, coins);
    }
    return r;
  };

  useEffect(() => {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) { router.replace("/subscribe"); return; }
    const s = JSON.parse(raw) as WizardSelections;
    // Seeding from sessionStorage, which is only readable on the client (post-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelections(s);
    if (sessionStorage.getItem(WIZARD_ORIGIN_KEY) === "renew") setOrigin("renew");
    refreshPrice(s, undefined, null).catch(() => setResult(null));
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
        email: contact.email,
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
    const r = await refreshPrice(selections, code || undefined, paymentMethodId, appliedCoins || undefined);
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

  const applyCoins = async () => {
    if (!selections) return;
    const requested = Number(coinsInput.trim());
    if (!coinsInput.trim() || !Number.isFinite(requested) || requested <= 0) {
      setAppliedCoins(0);
      setCoinsState({ status: "idle" });
      await refreshPrice(selections, appliedCode ?? undefined, paymentMethodId, undefined);
      return;
    }
    setCoinsState({ status: "checking" });
    const r = await refreshPrice(selections, appliedCode ?? undefined, paymentMethodId, requested);
    if (r.coinsError) {
      setAppliedCoins(0);
      setCoinsState({ status: "error", message: r.coinsError });
      return;
    }
    setAppliedCoins(requested);
    setCoinsState({ status: "applied", message: "Coins applied" });
  };

  const selectMethod = async (id: string) => {
    if (!selections) return;
    setPaymentMethodId(id);
    await refreshPrice(selections, appliedCode ?? undefined, id, appliedCoins || undefined);
  };

  const confirm = async () => {
    if (!selections) return;
    if (paymentMethods.length > 0 && !paymentMethodId) {
      toast.error("Choose a payment method");
      return;
    }
    setSubmitting(true);
    try {
      const res = await confirmSubscription({
        selections,
        planKey: selections.planKey!,
        contact,
        couponCode: appliedCode ?? undefined,
        coins: appliedCoins || undefined,
        paymentMethodId: paymentMethods.length > 0 ? paymentMethodId : null,
      });
      sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      // Out-of-zone: server created a waitlist inquiry, not an order — show the
      // waitlist confirmation instead of routing to activation.
      if (res.waitlisted) {
        setWaitlisted(true);
        setStep(1);
        return;
      }
      router.push(`/activate/${res.deploymentId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!selections) return null;

  const phoneValid = phoneSchema().safeParse(contact.phone.trim()).success;
  const emailValid = emailSchema.safeParse(contact.email.trim()).success;
  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId) ?? null;
  const realPayments = paymentMethods.length > 0;

  return (
    <div className="space-y-4">
      <SubscribeChrome
        closeHref={closeHref}
        onBack={() => (step > 1 ? setStep(1) : router.push(origin === "renew" ? "/me/renew" : "/subscribe"))}
        backLabel={step > 1 ? "Back" : "Edit plan"}
      />
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Checkout</h1>
    <div className="grid gap-6 md:grid-cols-[1fr_360px] md:items-start">
      <div className="space-y-5">
        <Stepper steps={CHECKOUT_STEPS} currentIndex={step - 1} />

        {step === 1 && (
          <Card variant="glow" className="p-5 sm:p-6">
            <section className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-balance">Address &amp; contact</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Where should we deliver your tiffins?</p>
              </div>
              <div className="grid gap-4">
                <div className="grid gap-1.5"><Label htmlFor="fullName">Full name</Label><Input id="fullName" autoComplete="name" className="h-13 rounded-2xl border-[1.5px] border-foreground px-4" value={contact.fullName} onChange={(e) => set({ fullName: e.target.value })} /></div>
                <div className="grid gap-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <PhoneInput id="phone" autoComplete="tel" value={contact.phone} onChange={(v) => set({ phone: v ?? "" })} defaultCountry={defaultCountry} />
                  {contact.phone.trim() && !phoneValid && <p className="text-xs text-destructive">Enter a valid phone number</p>}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" className="h-13 rounded-2xl border-[1.5px] border-foreground px-4" value={contact.email} onChange={(e) => set({ email: e.target.value })} />
                  {contact.email.trim() && !emailValid && <p className="text-xs text-destructive">Enter a valid email</p>}
                </div>
                <AddressFields
                  preset="delivery"
                  idPrefix="checkout"
                  fields={["addressLine", "city", "postalCode"]}
                  values={contact}
                  onChange={set}
                  resolveUrl="/api/address/resolve"
                  onPostalBlur={checkPostal}
                  postalSlot={
                    <>
                      <div className="flex items-end gap-2 pt-1">
                        <Button type="button" variant="outline" onClick={checkPostal}>Check</Button>
                      </div>
                      {zone?.served && (
                        <StatusBanner tone="success" icon={<MapPin className="mt-0.5 size-4 shrink-0" />}>
                          Served — {zone.name}, delivery {zone.slotWindow}.
                        </StatusBanner>
                      )}
                      {zone && !zone.served && !waitlisted && (
                        <div className={`space-y-2 rounded-lg p-3 ${toneClasses("warning").bg}`}>
                          <p className={`text-sm ${toneClasses("warning").text}`}>Not in your area yet.</p>
                          <Button type="button" variant="outline" disabled={!contact.fullName || !phoneValid || !emailValid} onClick={joinWaitlist}>Join waitlist</Button>
                        </div>
                      )}
                      {waitlisted && (
                        <StatusBanner tone="success" icon={<Check className="mt-0.5 size-4 shrink-0" />}>
                          You&apos;re on the waitlist — we&apos;ll email you when we reach your area.
                        </StatusBanner>
                      )}
                    </>
                  }
                />
              </div>
              <Button size="lg" className="hover-lift h-14 w-full rounded-full px-8 shadow-[0_12px_30px_-6px_var(--color-primary)] sm:w-auto" disabled={!contact.fullName || !phoneValid || !emailValid || !contact.postalCode || (zone != null && !zone.served)} onClick={() => setStep(2)}>Continue to payment</Button>
            </section>
          </Card>
        )}

        {step === 2 && (
          <Card variant="glow" className="p-5 sm:p-6">
            <section className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-balance">Payment</h2>
                {realPayments ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Choose how you&apos;ll pay. Delivery begins once payment is confirmed — if it isn&apos;t,
                    you can move upcoming deliveries ahead from Deliveries.
                  </p>
                ) : (
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <ShieldCheck className="size-4" /> Simulated — no real charge for this MVP.
                  </p>
                )}
              </div>

              {realPayments ? (
                <div className="grid gap-2">
                  {paymentMethods.map((m) => {
                    const selected = m.id === paymentMethodId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => selectMethod(m.id)}
                        className={cn(
                          "rounded-2xl border-[1.5px] border-foreground p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{m.label}</span>
                          {selected && <Check className="size-4 text-primary" />}
                        </div>
                        {selected && (m.payeeHandle || m.instructions) && (
                          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {m.payeeHandle && <p>Send to: <span className="font-medium text-foreground">{m.payeeHandle}</span></p>}
                            {m.instructions && <p className="whitespace-pre-wrap">{m.instructions}</p>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-1.5"><Label htmlFor="card">Card number</Label><Input id="card" inputMode="numeric" className="nums h-13 rounded-2xl border-[1.5px] border-foreground px-4" placeholder="4242 4242 4242 4242" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5"><Label htmlFor="exp">Expiry</Label><Input id="exp" className="nums h-13 rounded-2xl border-[1.5px] border-foreground px-4" placeholder="12/29" /></div>
                    <div className="grid gap-1.5"><Label htmlFor="cvc">CVC</Label><Input id="cvc" className="nums h-13 rounded-2xl border-[1.5px] border-foreground px-4" placeholder="123" /></div>
                  </div>
                </div>
              )}

              {selectedMethod && (
                <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  Your plan is reserved now. Deliveries start after we confirm payment
                  {selectedMethod.id === "etransfer" ? " (usually within one business day of your e-Transfer)" : ""}.
                  Need to shift days? Use Deliveries to move them ahead.
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="h-14 rounded-full border-[1.5px] border-foreground px-6" onClick={() => setStep(1)}>Back</Button>
                <Button
                  size="lg"
                  className="hover-lift h-14 flex-1 rounded-full px-8 shadow-[0_12px_30px_-6px_var(--color-primary)] sm:flex-none"
                  disabled={submitting || (realPayments && !paymentMethodId)}
                  onClick={confirm}
                >
                  {submitting ? "Confirming…" : origin === "renew" ? "Confirm renewal" : "Confirm Subscription"}
                </Button>
              </div>
            </section>
          </Card>
        )}
      </div>

      <aside className="space-y-3 md:sticky md:top-6">
        <Card variant="glow" className="space-y-3 rounded-2xl border-[1.5px] border-foreground p-4 shadow-[6px_6px_0_var(--color-primary)]">
          <h3 className="text-sm font-semibold">Order summary</h3>
          <Invoice result={result} />
          {applied.length > 0 && (
            <ul className="grid gap-1.5 rounded-lg bg-muted/50 p-3 text-xs">
              {applied.map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono">{c.code}</span>
                    <span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                      {c.auto ? "Auto-applied" : "Entered"}
                    </span>
                  </span>
                  <span className="nums text-emerald-600 dark:text-emerald-400">−${c.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-2xl border-[1.5px] border-dashed border-foreground p-3">
            <Label htmlFor="coupon" className="flex items-center gap-1.5 text-xs text-muted-foreground"><Tag className="size-3.5" /> Coupon code</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="coupon"
                className="h-11 rounded-xl border-[1.5px] border-foreground px-3 uppercase"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value); if (couponState.status !== "idle") setCouponState({ status: "idle" }); }}
                placeholder="e.g. SAVE10"
                autoCapitalize="characters"
              />
              <Button type="button" variant="outline" className="rounded-xl border-[1.5px] border-foreground" onClick={applyCoupon} disabled={couponState.status === "checking"}>
                {couponState.status === "checking" ? "Checking…" : "Apply"}
              </Button>
            </div>
            {couponState.status === "applied" && <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">{couponState.message}</p>}
            {couponState.status === "error" && <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">{couponState.message}</p>}
          </div>
          {coinBalance == null ? (
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <Link href="/login" className="underline">Sign in</Link> to pay with your coins.
            </p>
          ) : (
            <div className="rounded-lg bg-muted/50 p-3">
              <Label htmlFor="coins" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Coins className="size-3.5" /> Use coins ({coinBalance} available)
              </Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="coins"
                  inputMode="numeric"
                  value={coinsInput}
                  onChange={(e) => { setCoinsInput(e.target.value); if (coinsState.status !== "idle") setCoinsState({ status: "idle" }); }}
                  placeholder="e.g. 50"
                />
                <Button type="button" variant="outline" onClick={applyCoins} disabled={coinsState.status === "checking"}>
                  {coinsState.status === "checking" ? "Checking…" : "Apply"}
                </Button>
              </div>
              {coinsState.status === "applied" && <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">{coinsState.message}</p>}
              {coinsState.status === "error" && <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">{coinsState.message}</p>}
            </div>
          )}
          {zone?.served && <p className="text-xs text-muted-foreground">Delivery window: {zone.slotWindow}</p>}
        </Card>
      </aside>
    </div>
    </div>
  );
}
