"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Country } from "react-phone-number-input";
import { PhoneInput } from "@foundry/ui/phone-input";
import type { PricingResult } from "@/lib/pricing";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import {
  reprice,
  validatePostal,
  type AppliedCoupon,
  type CheckoutPaymentMethod,
  type RepriceResult,
} from "@/app/(public)/subscribe/actions";
import { confirmSubscription } from "@/app/(public)/checkout/actions";
import { createWebsiteInquiry } from "@/app/(marketing)/contact/actions";
import { toast } from "sonner";
import { emailSchema, phoneSchema } from "@foundry/commons";
import { WIZARD_ORIGIN_KEY, WIZARD_STEP_KEY, WIZARD_STORAGE_KEY, clearIdentity, readIdentity, resetSession, type WizardOrigin, type WizardSelections } from "@/components/wizard/selections";
import { OrderSummary } from "@/components/checkout/order-summary";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";
import { Button, Input, Label, OptionCard, Pill } from "@/components/customer/kit";
import { AddressFields } from "@/components/customer/address/address-fields";
import { Check, Coins, MapPin, ShieldCheck, Tag } from "lucide-react";
import { Stepper } from "@/components/stepper";
import { StatusBanner, toneClasses } from "@/components/checkout/status-banner";

const PILL = "!min-h-12 !px-6";
const PANEL = "bg-card border-border rounded-[20px] border p-5 sm:p-6";
// The shared @foundry/ui inputs are h-8; scope a 44px touch height over every field
// (name, phone + country button, address, card, coupon, coins) so they all match.
const FIELDS = "[&_input]:h-11 [&_input]:rounded-xl [&_button[role=combobox]]:h-11 [&_button[role=combobox]]:rounded-xl [&_[data-slot=popover-trigger]]:h-11";

const CHECKOUT_STEPS = ["Address & contact", "Payment"] as const;

type Contact = {
  fullName: string;
  phone: string;
  email: string;
  addressLine: string;
  addressUnit?: string;
  city: string;
  postalCode: string;
  deliveryInstructions?: string;
};
const emptyContact: Contact = {
  fullName: "",
  phone: "",
  email: "",
  addressLine: "",
  addressUnit: "",
  city: "",
  postalCode: "",
  deliveryInstructions: "",
};

function formatChargeHint(item: { chargeType: "none" | "fixed" | "percent"; chargeValue: number }) {
  if (item.chargeType === "none" || item.chargeValue === 0) return "Free";
  if (item.chargeType === "fixed") return `+$${item.chargeValue.toFixed(2)}`;
  if (item.chargeType === "percent") return `+${item.chargeValue}%`;
  return "";
}

export function Checkout({
  defaultCountry,
  closeHref = "/me",
  prefill,
  catalog,
}: {
  defaultCountry: Country;
  closeHref?: string;
  /** Present only for a signed-in customer: their account's contact. */
  prefill?: Partial<Contact>;
  catalog?: ClientCatalogSnapshot;
}) {
  const router = useRouter();
  const [selections, setSelections] = useState<WizardSelections | null>(null);
  const [result, setResult] = useState<PricingResult | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [contact, setContact] = useState<Contact>({ ...emptyContact, ...prefill });
  const [zone, setZone] = useState<{ served: boolean; name?: string; slotWindow?: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedCoupon[]>([]);
  const [couponState, setCouponState] = useState<{ status: "idle" | "checking" | "applied" | "error"; message?: string }>({ status: "idle" });
  const [coinsInput, setCoinsInput] = useState("");
  const [appliedCoins, setAppliedCoins] = useState(0);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [coinCap, setCoinCap] = useState<RepriceResult["coinCap"]>(null);
  const [coinsState, setCoinsState] = useState<{ status: "idle" | "checking" | "applied" | "error"; message?: string }>({ status: "idle" });
  const [waitlisted, setWaitlisted] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<CheckoutPaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  // Where "Edit plan" sends the customer back to — the flow that actually wrote
  // WIZARD_STORAGE_KEY, not always the full wizard.
  // The email captured at the identity gate; a guest is not asked for it again.
  const [gateEmail, setGateEmail] = useState<string | null>(null);
  const [origin, setOrigin] = useState<WizardOrigin>("subscribe");

  const refreshPrice = async (
    s: WizardSelections,
    code: string | undefined,
    methodId: string | null,
    coins?: number,
  ) => {
    // Postal code drives province sales tax, so the receipt must be re-priced
    // with it — otherwise the preview total would omit tax the order charges.
    const r = await reprice(s, code, s.planKey ?? undefined, methodId, coins, contact.postalCode || undefined);
    setResult(r.pricing);
    setApplied(r.appliedCoupons);
    setPaymentMethods(r.paymentMethods);
    setCoinBalance(r.coinBalance);
    setCoinCap(r.coinCap);
    // Auto-pick the first enabled method when none chosen yet.
    if (!methodId && r.paymentMethods.length > 0) {
      setPaymentMethodId(r.paymentMethods[0]!.id);
      return refreshPrice(s, code, r.paymentMethods[0]!.id, coins);
    }
    return r;
  };

  // A checkout without a known email must never exist: anyone arriving without one (direct visit, a stale tab, or
  // Back after "Not you?") goes to the email step first. `replace` keeps the checkout out of the history.
  useEffect(() => {
    const guard = () => {
      if (prefill == null && readIdentity()?.kind !== "guest") router.replace("/subscribe");
    };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) guard(); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [router, prefill]);

  useEffect(() => {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) { router.replace("/subscribe"); return; }
    if (prefill == null && readIdentity()?.kind !== "guest") { router.replace("/subscribe"); return; }
    const s = JSON.parse(raw) as WizardSelections;
    // Seeding from sessionStorage, which is only readable on the client (post-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelections(s);
    if (sessionStorage.getItem(WIZARD_ORIGIN_KEY) === "renew") setOrigin("renew");
    const identity = readIdentity();
    if (identity?.kind === "guest" && prefill == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGateEmail(identity.email);
      setContact((c) => ({ ...c, email: identity.email }));
    }
    refreshPrice(s, undefined, null).catch(() => setResult(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleAddressTagSelect = (tagId: string) => {
    if (!selections) return;
    const next = { ...selections, addressTagId: tagId === selections.addressTagId ? null : tagId };
    setSelections(next);
    void refreshPrice(next, appliedCode ?? undefined, paymentMethodId, appliedCoins || undefined);
  };

  const handleDeliveryStrategySelect = (typeId: string) => {
    if (!selections) return;
    const next = { ...selections, deliveryStrategyId: typeId === selections.deliveryStrategyId ? null : typeId };
    setSelections(next);
    void refreshPrice(next, appliedCode ?? undefined, paymentMethodId, appliedCoins || undefined);
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
        renewal: lockContact,
        couponCode: appliedCode ?? undefined,
        coins: appliedCoins || undefined,
        paymentMethodId: paymentMethods.length > 0 ? paymentMethodId : null,
      });
      sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      sessionStorage.removeItem(WIZARD_STEP_KEY);
      clearIdentity();
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

  // A signed-in customer's name and email are their account's, changed from Account
  // and not here. confirmSubscription re-takes both from the session regardless, so
  // this is the visible half, not the guarantee. Phone and address stay editable
  // (this order only).
  const lockContact = prefill != null;
  const emailReadOnly = lockContact || gateEmail != null;
  const useDifferentEmail = () => {
    resetSession();
    router.replace("/subscribe");
  };
  const fromAccount = lockContact ? <Pill tone="soft" size="sm" className="ml-2 !px-2 !text-[11px] !font-medium">From your account</Pill> : null;
  const meal = catalog?.mealSizes.find((m) => m.publicId === selections.mealSizeId);
  const freq = catalog?.frequencies.find((f) => f.key === selections.frequencyKey);
  // The frequency name already spells out its days; the eating-day pills below show the chosen ones.
  const deliveryType = freq?.name ?? null;

  const phoneValid = phoneSchema().safeParse(contact.phone.trim()).success;
  const emailValid = emailSchema.safeParse(contact.email.trim()).success;
  const goBack = () => (step > 1 ? setStep(1) : router.push(origin === "renew" ? "/me/renew" : "/subscribe"));
  const step1Reason = !contact.fullName.trim() ? "Enter your full name to continue."
    : !phoneValid ? "Add your phone number to continue."
    : !emailValid ? "Add your email to continue."
    : !contact.postalCode ? "Enter your postal code to continue."
    : zone != null && !zone.served ? "We don't deliver to this postal code yet. Join the waitlist above."
    : null;
  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId) ?? null;
  const realPayments = paymentMethods.length > 0;
  const actionReason = step === 1 ? step1Reason : realPayments && !paymentMethodId ? "Choose a payment method to confirm." : null;

  return (
    <div className="space-y-4 pb-28 md:pb-8">
      <SubscribeChrome
        closeHref={closeHref}
        onBack={goBack}
        backLabel={step > 1 ? "Back" : "Edit plan"}
      />
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Checkout</h1>
    <div className="grid gap-6 md:grid-cols-[1fr_360px] md:items-start">
      <div className="space-y-5">
        <Stepper steps={CHECKOUT_STEPS} currentIndex={step - 1} />

        {step === 1 && (
          <div className={`${PANEL} ${FIELDS}`}>
            <section className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-balance">Address &amp; contact</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Where should we deliver your tiffins?</p>
              </div>
              <div className="grid gap-4">
                <div className="grid gap-1.5"><Label htmlFor="fullName">Full name</Label><Input dense id="fullName" autoComplete="name" autoCapitalize="words" enterKeyHint="next" className={lockContact ? "bg-[color-mix(in_oklch,var(--muted)_50%,transparent)] text-[var(--muted-foreground)]" : undefined} readOnly={lockContact} value={contact.fullName} onChange={(e) => set({ fullName: e.target.value })} />
                  {lockContact ? <p className="text-xs text-muted-foreground text-pretty"><Link href="/me/account?section=profile" className="underline">Change your name in Account</Link>.</p> : null}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="phone">Phone{fromAccount}</Label>
                  <PhoneInput id="phone" autoComplete="tel" inputMode="tel" value={contact.phone} onChange={(v) => set({ phone: v ?? "" })} defaultCountry={defaultCountry} />
                  {contact.phone.trim() && !phoneValid && <p role="alert" className="text-[13px] text-destructive">Enter a valid phone number</p>}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input dense
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    className={emailReadOnly ? "bg-[color-mix(in_oklch,var(--muted)_50%,transparent)] text-[var(--muted-foreground)]" : undefined}
                    value={contact.email}
                    readOnly={emailReadOnly}
                    aria-describedby={emailReadOnly ? "email-locked-hint" : undefined}
                    onChange={(e) => set({ email: e.target.value })}
                  />
                  {lockContact ? (
                    <p id="email-locked-hint" className="text-xs text-muted-foreground text-pretty">
                      Renewals use your account email. <Link href="/me/account?section=contact" className="underline">Change it in Account</Link>.
                    </p>
                  ) : gateEmail != null ? (
                    <p id="email-locked-hint" className="text-xs text-muted-foreground text-pretty">
                      <button type="button" onClick={useDifferentEmail} className="min-h-11 underline">Not you? Use a different email</button>
                    </p>
                  ) : contact.email.trim() && !emailValid ? (
                    <p role="alert" className="text-[13px] text-destructive">Enter a valid email</p>
                  ) : null}
                </div>
                {lockContact ? (
                  <p className="-mb-2 text-xs text-muted-foreground text-pretty">
                    <Pill tone="neutral" size="sm" className="!px-2 !text-[11px] !font-medium">From your account</Pill>{" "}
                    Edit the address if this order goes elsewhere. Your saved address won&apos;t change; <Link href="/me/account?section=address" className="underline">update it in Account</Link>.
                  </p>
                ) : null}
                <AddressFields
                  preset="delivery"
                  idPrefix="checkout"
                  fields={["addressLine", "addressUnit", "city", "postalCode", "deliveryInstructions"]}
                  values={contact}
                  onChange={set}
                  resolveUrl="/api/address/resolve"
                  onPostalBlur={checkPostal}
                  postalSlot={
                    <div data-postal-slot>
                      <Button pill variant="quiet" className="!min-h-11 !px-5 !text-sm" onClick={checkPostal}>Check area</Button>
                    </div>
                  }
                />
                {catalog?.deliveryCharges && (catalog.deliveryCharges.addressTags.length > 0 || catalog.deliveryCharges.deliveryStrategies.length > 0) && (
                  <div className="space-y-4 pt-1" data-testid="delivery-charge-options">
                    {catalog.deliveryCharges.addressTags.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Address type
                        </Label>
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Address type">
                          {catalog.deliveryCharges.addressTags.map((tag) => {
                            const isSelected = selections?.addressTagId === tag.id;
                            const hint = formatChargeHint(tag);
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() => handleAddressTagSelect(tag.id)}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background text-foreground border-border hover:bg-muted"
                                }`}
                              >
                                <span>{tag.name}</span>
                                <span className={`text-[11px] ${isSelected ? "opacity-90" : "text-muted-foreground"}`}>
                                  {hint}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {catalog.deliveryCharges.deliveryStrategies.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Delivery location
                        </Label>
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Delivery location">
                          {catalog.deliveryCharges.deliveryStrategies.map((type) => {
                            const isSelected = selections?.deliveryStrategyId === type.id;
                            const hint = formatChargeHint(type);
                            return (
                              <button
                                key={type.id}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() => handleDeliveryStrategySelect(type.id)}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background text-foreground border-border hover:bg-muted"
                                }`}
                              >
                                <span>{type.name}</span>
                                <span className={`text-[11px] ${isSelected ? "opacity-90" : "text-muted-foreground"}`}>
                                  {hint}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid gap-2 empty:hidden">
                  {zone?.served && (
                    <StatusBanner tone="success" icon={<MapPin className="mt-0.5 size-4 shrink-0" />}>
                      Served — {zone.name}{zone.slotWindow ? `, delivery ${zone.slotWindow}` : ""}.
                    </StatusBanner>
                  )}
                  {zone && !zone.served && !waitlisted && (
                    <div className={`space-y-2 rounded-2xl p-3 ${toneClasses("warning").bg}`}>
                      <p className={`text-sm ${toneClasses("warning").text}`}>We don&apos;t deliver here yet.{!contact.fullName || !phoneValid || !emailValid ? " Fill in your name, phone and email above to join the waitlist." : ""}</p>
                      <Button pill variant="quiet" className="!min-h-11" disabled={!contact.fullName || !phoneValid || !emailValid} onClick={joinWaitlist}>Join waitlist</Button>
                    </div>
                  )}
                  {waitlisted && (
                    <StatusBanner tone="success" icon={<Check className="mt-0.5 size-4 shrink-0" />}>
                      You&apos;re on the waitlist — we&apos;ll email you when we reach your area.
                    </StatusBanner>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}


        {step === 2 && (
          <div className={`${PANEL} ${FIELDS}`}>
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
                      <OptionCard key={m.id} selected={selected} onClick={() => selectMethod(m.id)} className="flex min-h-14 flex-col justify-center p-4">
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
                      </OptionCard>
                    );
                  })}
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid gap-1.5"><Label htmlFor="card">Card number</Label><Input dense id="card" inputMode="numeric" autoComplete="cc-number" className="nums" placeholder="4242 4242 4242 4242" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5"><Label htmlFor="exp">Expiry</Label><Input dense id="exp" inputMode="numeric" autoComplete="cc-exp" className="nums" placeholder="12/29" /></div>
                    <div className="grid gap-1.5"><Label htmlFor="cvc">CVC</Label><Input dense id="cvc" inputMode="numeric" autoComplete="cc-csc" className="nums" placeholder="123" /></div>
                  </div>
                </div>
              )}

              {selectedMethod && (
                <p className="rounded-2xl bg-muted/50 p-3 text-[13px] text-muted-foreground">
                  Your plan is reserved now. Deliveries start after we confirm payment
                  {selectedMethod.id === "etransfer" ? " (usually within one business day of your e-Transfer)" : ""}.
                  Need to shift days? Use Deliveries to move them ahead.
                </p>
              )}

            </section>
          </div>
        )}

      </div>

      <aside id="order-summary" className={`scroll-mt-20 md:sticky md:top-24 ${FIELDS}`}>
        <div className={`${PANEL} space-y-3 p-4 sm:p-4`}>
          <h2 className="text-sm font-semibold">Order summary</h2>
          <OrderSummary selections={selections} result={result} mealName={meal?.name} baseline={catalog?.plans.find((p) => p.key === selections.planKey)?.name} deliveryType={deliveryType} editHref={origin === "renew" ? "/me/renew" : "/subscribe"}>
          {applied.length > 0 && (
            <ul className="grid gap-1.5 rounded-2xl bg-muted/50 p-3 text-xs">
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
          <div className="border-border rounded-2xl border border-dashed p-3">
            <Label htmlFor="coupon" className="!gap-1.5 !text-xs !font-normal text-[var(--muted-foreground)]"><Tag className="size-3.5" /> Coupon code</Label>
            <div className="mt-1.5 flex gap-2">
              <Input dense
                id="coupon"
                className="uppercase"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value); if (couponState.status !== "idle") setCouponState({ status: "idle" }); }}
                placeholder="e.g. SAVE10"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
              />
              <Button pill variant="quiet" className="!min-h-[46px] !border-transparent !bg-[var(--muted)] !px-4 !text-base" onClick={applyCoupon} disabled={couponState.status === "checking"}>
                {couponState.status === "checking" ? "Checking…" : "Apply"}
              </Button>
            </div>
            {couponState.status === "applied" && <p className="mt-1.5 text-[13px] text-emerald-700 dark:text-emerald-400">{couponState.message}</p>}
            {couponState.status === "error" && <p className="mt-1.5 text-[13px] text-amber-700 dark:text-amber-400" role="alert">{couponState.message}</p>}
          </div>
          {coinBalance == null ? (
            <p className="rounded-2xl bg-muted/50 p-3 text-xs text-muted-foreground">
              <Link href="/login" className="underline">Sign in</Link> to pay with your coins.
            </p>
          ) : (
            <div className="rounded-2xl bg-muted/50 p-3">
              <Label htmlFor="coins" className="!gap-1.5 !text-xs !font-normal text-[var(--muted-foreground)]">
                <Coins className="size-3.5" /> Use coins ({coinBalance} available)
              </Label>
              {coinCap && coinBalance > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground text-pretty">
                  {coinCap.maxCoins > 0 ? `Up to ${coinCap.maxCoins} coins can be used on this order.` : "Coins can't be used on this order."}
                  {coinCap.message ? <> {coinCap.message}</> : null}
                </p>
              ) : null}
              <div className="mt-1.5 flex gap-2">
                <Input dense
                  id="coins"
                  inputMode="numeric"
                  autoComplete="off"
                  value={coinsInput}
                  onChange={(e) => { setCoinsInput(e.target.value); if (coinsState.status !== "idle") setCoinsState({ status: "idle" }); }}
                  placeholder="e.g. 50"
                />
                <Button pill variant="quiet" className="!min-h-[46px] !border-transparent !bg-[var(--muted)] !px-4 !text-base" onClick={applyCoins} disabled={coinsState.status === "checking"}>
                  {coinsState.status === "checking" ? "Checking…" : "Apply"}
                </Button>
              </div>
              {coinsState.status === "applied" && <p className="mt-1.5 text-[13px] text-emerald-700 dark:text-emerald-400">{coinsState.message}</p>}
              {coinsState.status === "error" && <p className="mt-1.5 text-[13px] text-amber-700 dark:text-amber-400" role="alert">{coinsState.message}</p>}
            </div>
          )}
          {zone?.served && zone.slotWindow && <p className="text-xs text-muted-foreground">Delivery window: {zone.slotWindow}</p>}
          </OrderSummary>
          <ActionBar reason={actionReason} total={result?.total} backLabel={step > 1 ? "Back" : "Edit plan"} onBack={goBack}>
            {step === 1 ? (
              <Button pill variant="primary" className={`${PILL} flex-1 md:w-full`} disabled={step1Reason != null} onClick={() => {
                setStep(2);
                // The address is final now — re-price so tax reflects its province.
                void refreshPrice(selections, appliedCode ?? undefined, paymentMethodId, appliedCoins || undefined).catch(() => undefined);
              }}>Continue to payment</Button>
            ) : (
              <Button
                pill
                variant="primary"
                className={`${PILL} flex-1 md:w-full`}
                disabled={submitting || (realPayments && !paymentMethodId)}
                onClick={confirm}
              >
                {submitting ? "Confirming…" : origin === "renew" ? "Confirm renewal" : "Confirm Subscription"}
              </Button>
            )}
          </ActionBar>
        </div>
      </aside>
    </div>
    </div>
  );
}

function ActionBar({ reason, total, backLabel, onBack, children }: { reason: string | null; total?: number; backLabel: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="bg-background/80 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-20 max-md:space-y-2 max-md:border-t max-md:px-4 max-md:pt-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] max-md:backdrop-blur-xl md:space-y-2 md:bg-transparent">
      {reason && <p role="status" className="text-[13px] text-muted-foreground">{reason}</p>}
      <div className="flex items-center gap-2 md:block">
        <Button pill variant="quiet" className="!min-h-12 w-24 shrink-0 !px-3 sm:hidden" onClick={onBack}>{backLabel}</Button>
        {total != null && (
          <a href="#order-summary" className="bg-primary/15 flex h-12 shrink-0 flex-col justify-center rounded-full px-4 text-[13px] leading-tight font-semibold tabular-nums md:hidden">
            <span className="text-muted-foreground text-[11px] font-medium">Total</span>${total.toFixed(2)}
          </a>
        )}
        {children}
      </div>
    </div>
  );
}
