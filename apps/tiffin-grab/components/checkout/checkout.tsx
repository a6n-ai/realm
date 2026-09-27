"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatPhoneNumberIntl, type Country } from "react-phone-number-input";
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
import { WIZARD_ORIGIN_KEY, WIZARD_STEP_KEY, WIZARD_STORAGE_KEY, type WizardOrigin, type WizardSelections } from "@/components/wizard/selections";
import { OrderSummary, money, startLabel } from "@/components/checkout/order-summary";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";
import { Progress } from "@/components/wizard/progress";
import { TotalChip } from "@/components/wizard/total-chip";
import { BottomBar, Button, Input, Label, OptionCard, Pill, PillToggle, Sheet } from "@/components/customer/kit";
import { AddressFields } from "@/components/customer/address/address-fields";
import { DropOffPicker } from "@/components/customer/address/drop-off";
import { dropOffCatalog, dropOffSummary, validDropOff, type DropOffValue } from "@/lib/catalog/drop-off";
import type { SavedAddress } from "@foundry/address";
import { CheckoutAddressPicker } from "@/components/checkout/address-picker";
import { Check, ChevronRight, Coins, Info, MapPin, ShieldCheck, Tag } from "lucide-react";
import { StatusBanner, toneClasses } from "@/components/checkout/status-banner";

const STEPS = ["Plan", "Delivery", "Payment"] as const;
const TITLES = { 1: "Where should we deliver?", 2: "How would you like to pay?" } as const;
const H = "text-muted-foreground text-[13px] font-semibold tracking-[0.02em]";
// @foundry/ui PhoneInput is h-8; lift it (and its country button) to the kit's 52px field.
const PHONE = "[&_input]:h-[52px] [&_input]:rounded-2xl [&_input]:text-base [&_button]:h-[52px] [&_button]:rounded-2xl";

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

type AddressDraft = Pick<Contact, "addressLine" | "addressUnit" | "city" | "postalCode" | "deliveryInstructions">;
const EMPTY_ADDRESS: AddressDraft = { addressLine: "", addressUnit: "", city: "", postalCode: "", deliveryInstructions: "" };
const addressOf = (c: Contact): AddressDraft => ({
  addressLine: c.addressLine,
  addressUnit: c.addressUnit ?? "",
  city: c.city,
  postalCode: c.postalCode,
  deliveryInstructions: c.deliveryInstructions ?? "",
});

const oneLine = (a: AddressDraft) => [a.addressUnit ? `${a.addressUnit}–${a.addressLine}` : a.addressLine, a.city, a.postalCode].filter(Boolean).join(", ");

/** A saved address's fields in the checkout contact shape. */
function addressFields(a: SavedAddress): Partial<Contact> {
  return {
    addressLine: a.addressLine,
    addressUnit: a.addressUnit ?? "",
    city: a.city,
    postalCode: a.postalCode,
    deliveryInstructions: a.deliveryInstructions ?? "",
  };
}

function formatChargeHint(item: { chargeType: "none" | "fixed" | "percent"; chargeValue: number }) {
  if (item.chargeType === "none" || item.chargeValue === 0) return "Free";
  if (item.chargeType === "fixed") return `+$${item.chargeValue.toFixed(2)}`;
  if (item.chargeType === "percent") return `+${item.chargeValue}%`;
  return "";
}

const noSubscribe = () => () => {};

export function Checkout({
  defaultCountry,
  closeHref = "/me",
  prefill,
  catalog,
  savedAddresses = [],
  addressDropOffs = {},
}: {
  defaultCountry: Country;
  closeHref?: string;
  /** Present only for a signed-in customer: their account's contact. */
  prefill?: Partial<Contact>;
  catalog?: ClientCatalogSnapshot;
  /** Customer's saved addresses (default first); empty before they save one. */
  savedAddresses?: SavedAddress[];
  /** Saved address public id → its drop-off. */
  addressDropOffs?: Record<string, DropOffValue>;
}) {
  const router = useRouter();
  const dropOff = dropOffCatalog(catalog?.deliveryCharges);
  const defaultAddress = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0] ?? null;
  /** The wizard's saved plan, plus the default address's own drop-off unless this order already chose one. */
  const seed = (raw: string): WizardSelections => {
    const parsed = JSON.parse(raw) as WizardSelections;
    const own = defaultAddress ? addressDropOffs[defaultAddress.publicId] : undefined;
    const ownPick = own && !parsed.deliveryTagId ? validDropOff(dropOff, own) : null;
    return ownPick ? { ...parsed, deliveryTagId: ownPick.tagId, deliveryStrategyIds: ownPick.strategyIds } : parsed;
  };
  // Read during render on a client navigation (wizard → checkout) so the page arrives filled and the
  // page transition animates real content; the server snapshot is null, so a full load seeds after hydration.
  const storedRaw = useSyncExternalStore(noSubscribe, () => (prefill ? sessionStorage.getItem(WIZARD_STORAGE_KEY) : null), () => null);
  const storedOrigin = useSyncExternalStore(noSubscribe, () => sessionStorage.getItem(WIZARD_ORIGIN_KEY), () => null);
  const [selections, setSelections] = useState<WizardSelections | null>(() => (storedRaw ? seed(storedRaw) : null));
  const [result, setResult] = useState<PricingResult | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  // null = the customer is typing a new address (always the case with no saved address).
  const [addressPublicId, setAddressPublicId] = useState<string | null>(defaultAddress?.publicId ?? null);
  const [contact, setContact] = useState<Contact>({
    ...emptyContact,
    ...prefill,
    ...(defaultAddress ? addressFields(defaultAddress) : {}),
  });
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
  const [summaryOpen, setSummaryOpen] = useState(false);
  // The address sheet's working copy; null = closed. Saved into `contact` only on "Use this address".
  const [editor, setEditor] = useState<AddressDraft | null>(null);
  // The typed-in address, kept apart from `contact` so picking a saved address doesn't lose it.
  // Starts as the account's address on file when there is no address book yet.
  const [draft, setDraft] = useState<AddressDraft | null>(
    savedAddresses.length === 0 && prefill?.addressLine ? addressOf({ ...emptyContact, ...prefill }) : null,
  );
  // Where "Edit plan" sends the customer back to — the flow that actually wrote
  // WIZARD_STORAGE_KEY, not always the full wizard.
  const [origin, setOrigin] = useState<WizardOrigin>(storedOrigin === "renew" ? "renew" : "subscribe");
  const reduce = useReducedMotion();
  const prevStep = useRef(step);

  useEffect(() => {
    if (prevStep.current !== step) window.scrollTo({ top: 0 });
    prevStep.current = step;
  }, [step]);

  const refreshPrice = async (
    s: WizardSelections,
    code: string | undefined,
    methodId: string | null,
    coins?: number,
    postalCode = contact.postalCode,
  ) => {
    // Postal code drives province sales tax, so the receipt must be re-priced
    // with it — otherwise the preview total would omit tax the order charges.
    const r = await reprice(s, code, s.planKey ?? undefined, methodId, coins, postalCode || undefined);
    setResult(r.pricing);
    setApplied(r.appliedCoupons);
    setPaymentMethods(r.paymentMethods);
    setCoinBalance(r.coinBalance);
    setCoinCap(r.coinCap);
    // Auto-pick the first enabled method when none chosen yet.
    if (!methodId && r.paymentMethods.length > 0) {
      setPaymentMethodId(r.paymentMethods[0]!.id);
      return refreshPrice(s, code, r.paymentMethods[0]!.id, coins, postalCode);
    }
    return r;
  };

  // The page redirects signed-out visitors; this covers a bfcache restore after signing out
  // (Back into a stale checkout). `replace` keeps the checkout out of the history.
  useEffect(() => {
    const guard = () => {
      if (prefill == null) router.replace("/subscribe");
    };
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) guard(); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [router, prefill]);

  useEffect(() => {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) { router.replace("/subscribe"); return; }
    if (prefill == null) { router.replace("/subscribe"); return; }
    const s = selections ?? seed(raw);
    // A full page load seeds here: sessionStorage is only readable on the client, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selections) setSelections(s);
    if (sessionStorage.getItem(WIZARD_ORIGIN_KEY) === "renew") setOrigin("renew");
    refreshPrice(s, undefined, null).catch(() => setResult(null));
    // The default saved address is checked against our zones straight away, like a picked one.
    // The first price above already used its postal code, so no second re-price.
    if (defaultAddress) void checkPostal(defaultAddress.postalCode, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const checkPostal = async (postalCode = contact.postalCode, withPrice = true) => {
    if (!postalCode.trim()) return;
    const res = await validatePostal(postalCode);
    setZone(res.served ? { served: true, name: res.zone!.name, slotWindow: res.zone!.slotWindow } : { served: false });
    // A served address fixes the province, so the total shown from here on includes its tax.
    if (res.served && withPrice && selections) {
      void refreshPrice(selections, appliedCode ?? undefined, paymentMethodId, appliedCoins || undefined, postalCode).catch(() => undefined);
    }
  };

  const set = (patch: Partial<Contact>) => {
    setContact((c) => ({ ...c, ...patch }));
    // A complete postal code — typed or filled from a picked address suggestion — is checked against our zones right away.
    if (patch.postalCode != null && /^[A-Z]\d[A-Z](\d[A-Z]\d)?$/i.test(patch.postalCode.replace(/\s+/g, ""))) void checkPostal(patch.postalCode);
  };

  const pickAddress = (a: SavedAddress | null) => {
    setAddressPublicId(a?.publicId ?? null);
    // Drop-off belongs to the address: a saved one brings its own (and its charge), or none.
    if (a) handleDropOffChange(validDropOff(dropOff, addressDropOffs[a.publicId]));
    const next = a ? addressFields(a) : (draft ?? EMPTY_ADDRESS);
    setContact((c) => ({ ...c, ...next }));
    setZone(null);
    if (next.postalCode) void checkPostal(next.postalCode);
  };

  const saveEditor = () => {
    if (!editor) return;
    setDraft(editor);
    setAddressPublicId(null);
    setContact((c) => ({ ...c, ...editor }));
    setZone(null);
    void checkPostal(editor.postalCode);
    setEditor(null);
  };

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

  function handleDropOffChange(value: DropOffValue) {
    if (!selections) return;
    const current = selections.deliveryStrategyIds ?? [];
    const same = value.tagId === (selections.deliveryTagId ?? null)
      && value.strategyIds.length === current.length && value.strategyIds.every((p) => current.includes(p));
    if (same) return;
    const next = { ...selections, deliveryTagId: value.tagId, deliveryStrategyIds: value.strategyIds };
    setSelections(next);
    void refreshPrice(next, appliedCode ?? undefined, paymentMethodId, appliedCoins || undefined);
  }

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
        addressPublicId,
        renewal: lockContact,
        couponCode: appliedCode ?? undefined,
        coins: appliedCoins || undefined,
        paymentMethodId: paymentMethods.length > 0 ? paymentMethodId : null,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      sessionStorage.removeItem(WIZARD_STORAGE_KEY);
      sessionStorage.removeItem(WIZARD_STEP_KEY);
      // Out-of-zone: server created a waitlist inquiry, not an order — show the
      // waitlist confirmation instead of routing to activation.
      if (res.waitlisted) {
        setWaitlisted(true);
        setStep(1);
        return;
      }
      router.push(`/activate/${res.deploymentId}`, { transitionTypes: ["nav-forward"] });
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
  // (this order only). The page only renders for a signed-in customer.
  const lockContact = prefill != null;
  const meal = catalog?.mealSizes.find((m) => m.publicId === selections.mealSizeId);
  const baseline = catalog?.plans.find((p) => p.key === selections.planKey)?.name;
  const freq = catalog?.frequencies.find((f) => f.key === selections.frequencyKey);
  // The frequency name already spells out its days; the eating-day pills show the chosen ones.
  const deliveryType = freq?.name ?? null;
  const editHref = origin === "renew" ? "/me/renew" : "/subscribe";

  const phoneValid = phoneSchema().safeParse(contact.phone.trim()).success;
  const emailValid = emailSchema.safeParse(contact.email.trim()).success;
  const goBack = () => (step > 1 ? setStep(1) : router.push(editHref, { transitionTypes: ["nav-back"] }));
  const backLabel = step > 1 ? "Back" : "Edit plan";
  const step1Reason = !contact.fullName.trim() ? "Add your name in Account to continue."
    : !emailValid ? "Add an email in Account to continue."
    : !contact.postalCode ? "Add your delivery address to continue."
    : zone != null && !zone.served ? "We don't deliver to this postal code yet. Join the waitlist above."
    : !phoneValid ? "Add your phone number to continue."
    : null;
  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId) ?? null;
  const realPayments = paymentMethods.length > 0;
  const actionReason = step === 1 ? step1Reason : realPayments && !paymentMethodId ? "Choose a payment method to confirm." : null;
  const addressLine = oneLine(contact);
  // Drop-off belongs to the picked address, so it renders under that address, not in its own section.
  const hasDropOffChoices = Boolean(catalog?.deliveryCharges && (catalog.deliveryCharges.addressTags.length > 0 || dropOff.groups.length > 0));
  const dropOffChoices = catalog?.deliveryCharges && (
    <div className="grid grid-cols-1 gap-5" data-testid="delivery-charge-options">
      {catalog.deliveryCharges.addressTags.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          <p className="text-[15px] font-semibold">Address type</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Address type">
            {catalog.deliveryCharges.addressTags.map((tag) => {
              const on = selections.addressTagId === tag.id;
              return (
                <PillToggle key={tag.id} role="radio" aria-checked={on} on={on} onClick={() => handleAddressTagSelect(tag.id)} className="h-10 flex-none gap-1.5 px-4 text-[14px] sm:text-[14px]">
                  {tag.name}
                  <span className="text-[12px] font-medium opacity-75">{formatChargeHint(tag)}</span>
                </PillToggle>
              );
            })}
          </div>
        </div>
      )}
      <DropOffPicker catalog={dropOff} value={{ tagId: selections.deliveryTagId ?? null, strategyIds: selections.deliveryStrategyIds ?? [] }} onChange={handleDropOffChange} />
    </div>
  );
  const dropOffText = dropOffSummary(dropOff, { tagId: selections.deliveryTagId ?? null, strategyIds: selections.deliveryStrategyIds ?? [] });
  const perWeek = selections.eatingDays?.length ?? 0;
  const start = startLabel(selections.startDate);

  const sign = step === 2 ? 1 : -1;
  const slide = reduce ? 0 : 24;
  const spring = reduce ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.4 };
  const reveal = { initial: { opacity: 0, y: reduce ? 0 : 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: spring };

  const summary = (plain = false) => (
    <OrderSummary plain={plain} selections={selections} result={result} mealName={meal?.name} baseline={baseline} deliveryType={deliveryType} editHref={editHref}>
      {applied.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Applied coupons">
          {applied.map((c) => (
            <li key={c.code}>
              <Pill tone="save" size="sm" icon={<Tag aria-hidden className="size-3" />}>
                <span className="font-mono">{c.code}</span>
                <span className="font-medium opacity-80">{c.auto ? "auto" : "entered"}</span>
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </OrderSummary>
  );

  return (
    <div className="pb-44 sm:pb-10">
      <SubscribeChrome
        brand
        closeHref={closeHref}
        onBack={goBack}
        backLabel={backLabel}
        stepTag={STEPS[step]}
        trailing={result ? <TotalChip tiffinCount={result.tiffinCount} total={result.total} open={summaryOpen} onOpen={() => setSummaryOpen(true)} /> : null}
      />

      <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_340px] md:items-start lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <div className="min-w-0">
          <Progress steps={STEPS} current={step} />

          <AnimatePresence mode="popLayout" initial={false} custom={sign}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: slide * sign }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -slide * sign }}
              transition={spring}
            >
              <h1 className="mb-6 text-[34px] leading-[1.06] font-bold tracking-[-0.03em] text-balance sm:text-[40px]">{TITLES[step]}</h1>

              <OrderGlance
                title={meal?.name ?? "Your plan"}
                baseline={baseline}
                meta={[result ? `${result.tiffinCount} tiffins` : null, perWeek ? `${perWeek} a week` : null, start ? `Starts ${start}` : null].filter(Boolean).join(" · ")}
                total={result?.total}
                onOpen={() => setSummaryOpen(true)}
              />

              {step === 1 ? (
                <div className="space-y-10">
                  <section aria-labelledby="co-address">
                    <h2 id="co-address" className={H}>Deliver to</h2>
                    <div className="mt-3 grid grid-cols-1 gap-4">
                      <CheckoutAddressPicker
                        addresses={savedAddresses}
                        value={addressPublicId}
                        onPick={pickAddress}
                        draft={draft ? oneLine(draft) : null}
                        draftFromAccount={draft != null && prefill?.addressLine === draft.addressLine && prefill?.postalCode === draft.postalCode}
                        onAdd={() => setEditor({ ...EMPTY_ADDRESS })}
                        onEditDraft={() => setEditor(draft ?? { ...EMPTY_ADDRESS })}
                        dropOff={dropOff}
                        dropOffs={addressDropOffs}
                        selectedExtra={hasDropOffChoices ? dropOffChoices : null}
                      />
                      <div aria-live="polite" className="grid gap-2 empty:hidden">
                        {zone?.served && !waitlisted && (
                          <motion.div key="served" {...reveal}>
                            <StatusBanner tone="success" icon={<MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />}>
                              <span className="font-semibold">We deliver here.</span> {zone.name}{zone.slotWindow ? `, ${zone.slotWindow}` : ""}
                            </StatusBanner>
                          </motion.div>
                        )}
                        {zone && !zone.served && !waitlisted && (
                          <motion.div key="unserved" {...reveal} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ${toneClasses("warning").bg}`}>
                            <p className={`text-sm font-medium ${toneClasses("warning").text}`}>We don&apos;t deliver here yet.</p>
                            <Button pill variant="quiet" className="!min-h-11" disabled={!contact.fullName || !phoneValid || !emailValid} onClick={joinWaitlist}>Join waitlist</Button>
                          </motion.div>
                        )}
                        {waitlisted && (
                          <StatusBanner tone="success" icon={<Check aria-hidden className="mt-0.5 size-4 shrink-0" />}>
                            You&apos;re on the waitlist. We&apos;ll email you when we reach your area.
                          </StatusBanner>
                        )}
                      </div>
                    </div>
                  </section>

                  <section aria-labelledby="co-contact">
                    <h2 id="co-contact" className={H}>Contact</h2>
                    <div className="mt-3 grid grid-cols-1 gap-4">
                      <div className="bg-card border-border flex items-center gap-3.5 rounded-[20px] border p-4">
                        <span aria-hidden className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold">
                          {(contact.fullName.trim()[0] ?? "?").toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[16px] font-semibold tracking-[-0.01em]">{contact.fullName || "Name not set"}</span>
                          <span className="text-muted-foreground block truncate text-[13px]">{contact.email}</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        <Label htmlFor="phone">Phone</Label>
                        <p id="phone-hint" className="text-muted-foreground -mt-1 text-[13px]">For delivery updates. Saved to your account.</p>
                        <div className={PHONE}>
                          <PhoneInput id="phone" autoComplete="tel" inputMode="tel" aria-required aria-describedby="phone-hint" value={contact.phone} onChange={(v) => set({ phone: v ?? "" })} defaultCountry={defaultCountry} />
                        </div>
                        {contact.phone.trim() && !phoneValid && <p role="alert" className="text-destructive text-[13px]">Enter a valid phone number</p>}
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-10">
                  <section aria-labelledby="co-pay">
                    <h2 id="co-pay" className={H}>Pay with</h2>
                    {realPayments ? (
                      <div role="radiogroup" aria-labelledby="co-pay" className="mt-3 grid grid-cols-1 gap-2.5">
                        {paymentMethods.map((m) => {
                          const on = m.id === paymentMethodId;
                          return (
                            <OptionCard key={m.id} role="radio" selected={on} onClick={() => selectMethod(m.id)} className="w-full px-4 py-4">
                              <span className="flex items-center justify-between gap-3">
                                <span className="text-[16px] font-semibold tracking-[-0.01em]">{m.label}</span>
                                <Radio on={on} />
                              </span>
                              <AnimatePresence initial={false}>
                                {on && (m.payeeHandle || m.instructions) && (
                                  <motion.span key="details" {...reveal} className="text-muted-foreground mt-2 block space-y-1 text-sm">
                                    {m.payeeHandle && <span className="block">Send to <span className="text-foreground font-semibold">{m.payeeHandle}</span></span>}
                                    {m.instructions && <span className="block whitespace-pre-wrap">{m.instructions}</span>}
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </OptionCard>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-1 gap-4">
                        <p className="text-muted-foreground flex items-center gap-1.5 text-sm"><ShieldCheck aria-hidden className="size-4" /> Simulated, no real charge.</p>
                        <div className="grid grid-cols-1 gap-1.5"><Label htmlFor="card">Card number</Label><Input id="card" inputMode="numeric" autoComplete="cc-number" className="nums" placeholder="4242 4242 4242 4242" /></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="grid grid-cols-1 gap-1.5"><Label htmlFor="exp">Expiry</Label><Input id="exp" inputMode="numeric" autoComplete="cc-exp" className="nums" placeholder="12/29" /></div>
                          <div className="grid grid-cols-1 gap-1.5"><Label htmlFor="cvc">CVC</Label><Input id="cvc" inputMode="numeric" autoComplete="cc-csc" className="nums" placeholder="123" /></div>
                        </div>
                      </div>
                    )}
                    {selectedMethod && (
                      <p className="text-muted-foreground mt-3 flex items-start gap-2 text-[13px] text-pretty">
                        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                        Your plan is reserved now. Deliveries start once we confirm payment{selectedMethod.id === "etransfer" ? ", usually within a business day" : ""}.
                      </p>
                    )}
                  </section>

                  <section aria-labelledby="co-savings">
                    <h2 id="co-savings" className={H}>Savings</h2>
                    <div className="bg-card border-border mt-3 divide-y divide-[var(--border)] rounded-[20px] border">
                      <ApplyRow
                        id="coupon"
                        icon={<Tag aria-hidden className="size-4" />}
                        label="Coupon code"
                        value={couponCode}
                        placeholder="SAVE10"
                        inputClassName="uppercase"
                        onChange={(v) => { setCouponCode(v); if (couponState.status !== "idle") setCouponState({ status: "idle" }); }}
                        onApply={applyCoupon}
                        state={couponState}
                      />
                      {coinBalance == null ? (
                        <p className="text-muted-foreground p-4 text-[13px]"><Link href="/login" className="underline underline-offset-2">Sign in</Link> to pay with your coins.</p>
                      ) : (
                        <ApplyRow
                          id="coins"
                          icon={<Coins aria-hidden className="size-4" />}
                          label={`Use coins (${coinBalance} available)`}
                          hint={coinCap && coinBalance > 0 ? `${coinCap.maxCoins > 0 ? `Up to ${coinCap.maxCoins} coins on this order.` : "Coins can't be used on this order."}${coinCap.message ? ` ${coinCap.message}` : ""}` : undefined}
                          value={coinsInput}
                          placeholder="50"
                          inputMode="numeric"
                          onChange={(v) => { setCoinsInput(v); if (coinsState.status !== "idle") setCoinsState({ status: "idle" }); }}
                          onApply={applyCoins}
                          state={coinsState}
                        />
                      )}
                    </div>
                  </section>

                  <section aria-labelledby="co-review">
                    <h2 id="co-review" className={H}>Review</h2>
                    <dl className="bg-card border-border mt-3 divide-y divide-[var(--border)] rounded-[20px] border text-sm">
                      <ReviewRow term="Order" action={<Link href={editHref} transitionTypes={["nav-back"]} className="text-primary text-[13px] font-semibold">Edit</Link>}>
                        {[meal?.name, baseline].filter(Boolean).join(" · ")}
                        <span className="text-muted-foreground block text-[13px]">{[result ? `${result.tiffinCount} tiffins` : null, start ? `starts ${start}` : null].filter(Boolean).join(", ")}</span>
                      </ReviewRow>
                      <ReviewRow term="Deliver to" action={<button type="button" onClick={() => setStep(1)} className="text-primary text-[13px] font-semibold">Change</button>}>
                        {addressLine}
                        {dropOffText && <span className="text-muted-foreground block text-[13px]">{dropOffText}</span>}
                        {zone?.slotWindow && <span className="text-muted-foreground block text-[13px]">Arrives {zone.slotWindow}</span>}
                      </ReviewRow>
                      <ReviewRow term="Contact">{formatPhoneNumberIntl(contact.phone) || contact.phone}</ReviewRow>
                      {selectedMethod && <ReviewRow term="Pay with">{selectedMethod.label}</ReviewRow>}
                      {result && (
                        <div className="flex items-baseline justify-between gap-3 px-4 py-4">
                          <dt className="text-[15px] font-semibold">Total</dt>
                          <dd className="nums text-primary text-[28px] leading-none font-bold tracking-[-0.03em]">{money(result.total)}</dd>
                        </div>
                      )}
                    </dl>
                  </section>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <BottomBar alignEnd note={actionReason ?? undefined} className="sm:sticky sm:mt-8 sm:px-0">
            <Button variant="quiet" size="lg" className="w-28 shrink-0 sm:hidden" onClick={goBack}>{backLabel}</Button>
            {step === 1 ? (
              <Button variant="primary" size="lg" className="flex-1 sm:min-h-10 sm:flex-none sm:px-8" disabled={step1Reason != null} onClick={() => {
                setStep(2);
                // The address is final now — re-price so tax reflects its province.
                void refreshPrice(selections, appliedCode ?? undefined, paymentMethodId, appliedCoins || undefined).catch(() => undefined);
              }}>Continue to payment</Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="flex-1 sm:min-h-10 sm:flex-none sm:px-8"
                pending={submitting}
                disabled={submitting || (realPayments && !paymentMethodId)}
                onClick={confirm}
              >
                <span className="whitespace-nowrap">Confirm subscription</span>
                {result && <span className="nums hidden font-medium whitespace-nowrap opacity-85 sm:inline">· {money(result.total)}</span>}
              </Button>
            )}
          </BottomBar>
        </div>

        <aside aria-label="Order summary" className="hidden md:sticky md:top-24 md:block">{summary()}</aside>
      </div>

      <Sheet
        open={editor != null}
        onClose={() => setEditor(null)}
        title="Delivery address"
        footer={
          <Button variant="primary" size="lg" className="w-full" disabled={!editor?.addressLine.trim() || !editor?.postalCode.trim()} onClick={saveEditor}>
            Use this address
          </Button>
        }
      >
        {editor && (
          <div className="pb-2">
            <AddressFields
              preset="delivery"
              idPrefix="checkout"
              fields={["addressLine", "addressUnit", "city", "postalCode", "deliveryInstructions"]}
              values={editor}
              onChange={(patch) => setEditor((e) => (e ? { ...e, ...patch } : e))}
              resolveUrl="/api/address/resolve"
            />
          </div>
        )}
      </Sheet>

      <Sheet bottom open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Your order">
        <div className="pb-3">{summary(true)}</div>
      </Sheet>
    </div>
  );
}

/** Mobile only: what's being ordered, above every step. Taps open the full summary. */
function OrderGlance({ title, baseline, meta, total, onOpen }: { title: string; baseline?: string | null; meta: string; total?: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="bg-card border-border mb-8 flex w-full items-center gap-3 rounded-[20px] border p-4 text-left transition-transform duration-100 active:scale-[0.98] motion-reduce:active:scale-100 md:hidden"
    >
      <span className="min-w-0 flex-1">
        <span className="text-muted-foreground block text-xs font-semibold tracking-[0.02em]">Your order</span>
        <span className="mt-0.5 block truncate text-[17px] font-semibold tracking-[-0.02em]">
          {baseline ? `${title} · ${baseline}` : title}
        </span>
        {meta && <span className="text-muted-foreground block truncate text-[13px]">{meta}</span>}
      </span>
      {total != null && <span className="nums text-[17px] font-bold">{money(total)}</span>}
      <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0" />
    </button>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${on ? "border-primary" : "border-border"}`}>
      <span className={`bg-primary size-2.5 rounded-full transition-transform duration-200 ${on ? "scale-100" : "scale-0"}`} />
    </span>
  );
}

function ReviewRow({ term, action, children }: { term: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <dt className="text-muted-foreground w-24 shrink-0 pt-px text-[13px] font-medium">{term}</dt>
      <dd className="min-w-0 flex-1 font-medium text-pretty">{children}</dd>
      {action}
    </div>
  );
}

type ApplyState = { status: "idle" | "checking" | "applied" | "error"; message?: string };

function ApplyRow({ id, icon, label, hint, value, placeholder, inputMode, inputClassName, onChange, onApply, state }: {
  id: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  inputMode?: "numeric";
  inputClassName?: string;
  onChange: (v: string) => void;
  onApply: () => void;
  state: ApplyState;
}) {
  return (
    <div className="p-4">
      <Label htmlFor={id} className="!gap-1.5 !text-[13px] !font-semibold">{icon} {label}</Label>
      {hint && <p className="text-muted-foreground mt-1 text-xs text-pretty">{hint}</p>}
      <div className="mt-2 flex gap-2">
        <Input
          dense
          id={id}
          className={inputClassName}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onApply(); } }}
          placeholder={placeholder}
          autoCapitalize={id === "coupon" ? "characters" : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <Button pill variant="quiet" className="!min-h-11 !px-5" onClick={onApply} disabled={state.status === "checking"}>
          {state.status === "checking" ? "Checking…" : "Apply"}
        </Button>
      </div>
      {state.status === "applied" && <p role="status" className="mt-2 text-[13px] font-medium text-emerald-700 dark:text-emerald-400">{state.message}</p>}
      {state.status === "error" && <p role="alert" className="mt-2 text-[13px] font-medium text-amber-700 dark:text-amber-400">{state.message}</p>}
    </div>
  );
}
