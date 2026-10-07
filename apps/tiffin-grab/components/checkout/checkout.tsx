"use client";

import { PaymentInstructions } from "@/components/payment-instructions";
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
import { pickedAddons, WIZARD_ORIGIN_KEY, WIZARD_STEP_KEY, WIZARD_STORAGE_KEY, type WizardOrigin, type WizardSelections } from "@/components/wizard/selections";
import { OrderSummary, money, startLabel } from "@/components/checkout/order-summary";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";
import { Progress } from "@/components/wizard/progress";
import { TotalChip } from "@/components/wizard/total-chip";
import { BottomBar, Button, Label, OptionCard, Pill, PillToggle, Sheet } from "@/components/customer/kit";
import { AddressFields } from "@/components/customer/address/address-fields";
import { isFullPostalCode } from "@/lib/catalog/postal";
import { DropOffPicker } from "@/components/customer/address/drop-off";
import { dropOffCatalog, dropOffSummary, validDropOff, type DropOffValue } from "@/lib/catalog/drop-off";
import type { SavedAddress } from "@foundry/address";
import { CheckoutAddressPicker } from "@/components/checkout/address-picker";
import { Check, ChevronRight, Coins, Info, MapPin, Plus, Tag, X } from "lucide-react";
import { StatusBanner, toneClasses } from "@/components/checkout/status-banner";
import { discountLine } from "@/components/customer/home/coupons-section";
import type { AvailableCoupon } from "@/lib/services/coupons.service";

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
const PRICE_RELOAD_KEY = "tiffin.checkout.price-reload";

export function Checkout({
  defaultCountry,
  closeHref = "/me",
  prefill,
  catalog,
  savedAddresses = [],
  addressDropOffs = {},
  suggestedCoupons = [],
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
  /** Live coupons a customer has to type in (auto-apply ones are excluded); shown as tap-to-apply chips. */
  suggestedCoupons?: AvailableCoupon[];
}) {
  const router = useRouter();
  const dropOff = dropOffCatalog(catalog?.deliveryCharges, catalog?.waivers);
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
  // Payment methods arrive with the price; if that load fails the payment step offers a retry.
  const [priceFailed, setPriceFailed] = useState(false);
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
  const [origin, setOrigin] = useState<WizardOrigin>(storedOrigin === "renew" || storedOrigin === "trial" ? storedOrigin : "subscribe");
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
    if (sessionStorage.getItem(WIZARD_ORIGIN_KEY) === "trial") setOrigin("trial");
    refreshPrice(s, undefined, null).then(
      () => sessionStorage.removeItem(PRICE_RELOAD_KEY),
      () => {
        // A tab left open across a deploy calls Server Action ids the new build no longer
        // has; deploymentId only catches that on navigation. One reload picks up the new
        // build (the plan is in sessionStorage); a second failure is real and shows Retry.
        if (!sessionStorage.getItem(PRICE_RELOAD_KEY)) {
          sessionStorage.setItem(PRICE_RELOAD_KEY, "1");
          window.location.reload();
          return;
        }
        setResult(null);
        setPriceFailed(true);
      },
    );
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
    if (patch.postalCode != null && isFullPostalCode(patch.postalCode)) void checkPostal(patch.postalCode);
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

  const applyCoupon = async (picked?: string) => {
    if (!selections) return;
    if (picked) setCouponCode(picked);
    const code = (picked ?? couponCode).trim();
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

  const removeCoupon = async () => {
    if (!selections) return;
    setCouponCode("");
    setAppliedCode(null);
    setCouponState({ status: "idle" });
    await refreshPrice(selections, undefined, paymentMethodId, appliedCoins || undefined);
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
  const deliveryType = selections.trialDays != null
    ? `Trial · ${selections.trialDays} ${selections.trialDays === 1 ? "day" : "days"}`
    : (freq?.name ?? null);
  const editHref = origin === "renew" ? "/me/renew" : origin === "trial" ? "/me/trial" : "/subscribe";

  const phoneValid = phoneSchema().safeParse(contact.phone.trim()).success;
  const emailValid = emailSchema.safeParse(contact.email.trim()).success;
  const goBack = () => (step > 1 ? setStep(1) : router.push(editHref, { transitionTypes: ["nav-back"] }));
  const backLabel = step > 1 ? "Back" : "Edit plan";
  const step1Reason = !contact.fullName.trim() ? "Add your name in Account to continue."
    : !emailValid ? "Add an email in Account to continue."
    : !contact.postalCode ? "Add your delivery address to continue."
    : !isFullPostalCode(contact.postalCode) ? "Enter your full postal code, like M5V 2T6."
    : zone != null && !zone.served ? "We don't deliver to this postal code yet. Join the waitlist above."
    : !phoneValid ? "Add your phone number to continue."
    : null;
  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId) ?? null;
  const realPayments = paymentMethods.length > 0;
  // Simulated payment is local-only; in prod an empty list just means not loaded yet
  // (the page shows a sorry screen when no rail is enabled at all).
  const simulated = !realPayments && result != null && process.env.NODE_ENV !== "production";
  const payReason = realPayments ? (paymentMethodId ? null : "Choose a payment method to confirm.")
    : simulated ? null
    : priceFailed ? "Couldn't load payment options. Tap Retry."
    : "Loading payment options…";
  // Reload, not re-call: after a deploy the same stale Server Action id fails every time.
  const retryPrice = () => window.location.reload();
  const actionReason = step === 1 ? step1Reason : payReason;
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
  // A trial stores its picked days in eatingDays too; that isn't a weekly rate.
  const perWeek = selections.trialDays == null ? (selections.eatingDays?.length ?? 0) : 0;
  const start = startLabel(selections.startDate);

  const sign = step === 2 ? 1 : -1;
  const slide = reduce ? 0 : 24;
  const spring = reduce ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.4 };
  const reveal = { initial: { opacity: 0, y: reduce ? 0 : 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: spring };

  const summary = (plain = false) => (
    <OrderSummary plain={plain} selections={selections} result={result} mealName={meal?.name} addons={pickedAddons(catalog, selections)} baseline={baseline} deliveryType={deliveryType} editHref={editHref}>
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
                            <div key={m.id} className="grid gap-2">
                              <OptionCard role="radio" selected={on} onClick={() => selectMethod(m.id)} className="w-full px-4 py-4">
                                <span className="flex items-center justify-between gap-3">
                                  <span className="text-[16px] font-semibold tracking-[-0.01em]">{m.label}</span>
                                  <Radio on={on} />
                                </span>
                              </OptionCard>
                              {/* Outside the card: the copy button can't nest inside the card's button. */}
                              <AnimatePresence initial={false}>
                                {on && (m.payeeHandle || m.instructions) && (
                                  <motion.div key="details" {...reveal} className="px-4">
                                    <PaymentInstructions payeeHandle={m.payeeHandle} instructions={m.instructions} />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      simulated ? (
                        <p className="text-muted-foreground mt-3 text-sm">Simulated, no real charge (local only).</p>
                      ) : priceFailed ? (
                        <div role="alert" className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-destructive text-sm">Couldn&apos;t load payment options.</p>
                          <Button pill variant="quiet" className="!min-h-11 !px-5" onClick={retryPrice}>Retry</Button>
                        </div>
                      ) : (
                        <p className="text-muted-foreground mt-3 text-sm">Loading payment options…</p>
                      )
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
                    <div className="bg-card border-border mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-[20px] border">
                      <AnimatePresence initial={false}>
                        {applied.map((c) => (
                          <motion.div key={c.code} {...reveal} className="flex min-h-16 items-center gap-3 px-4 py-3">
                            <RowIcon tone="save"><Tag aria-hidden className="size-[18px]" /></RowIcon>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[15px] font-semibold tracking-[0.04em] uppercase">{c.code}</p>
                              <p className="text-muted-foreground truncate text-[13px]">{c.auto ? "Applied automatically" : c.name}</p>
                            </div>
                            <span className="nums shrink-0 text-[15px] font-semibold text-emerald-700 dark:text-emerald-400">−{money(c.amount)}</span>
                            {!c.auto && (
                              <button type="button" onClick={removeCoupon} aria-label={`Remove coupon ${c.code}`} className="text-muted-foreground -mr-2 grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--muted)] active:scale-[0.94] motion-reduce:active:scale-100">
                                <X aria-hidden className="size-[18px]" />
                              </button>
                            )}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {!appliedCode && (
                        <CouponEntry
                          value={couponCode}
                          onChange={(v) => { setCouponCode(v); if (couponState.status !== "idle") setCouponState({ status: "idle" }); }}
                          onApply={() => applyCoupon()}
                          state={couponState}
                          reveal={reveal}
                          suggestions={suggestedCoupons.filter((c) => !applied.some((a) => a.code.toUpperCase() === c.code.toUpperCase()))}
                          onPick={(code) => void applyCoupon(code)}
                        />
                      )}
                      {coinBalance === 0 ? null : coinBalance == null ? (
                        <p className="text-muted-foreground flex min-h-16 items-center gap-3 px-4 py-3 text-[13px]">
                          <RowIcon><Coins aria-hidden className="size-[18px]" /></RowIcon>
                          <span><Link href="/login" className="text-primary font-semibold">Sign in</Link> to pay with your coins.</span>
                        </p>
                      ) : (
                        <div className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <RowIcon tone="wash"><Coins aria-hidden className="size-[18px]" /></RowIcon>
                            <div className="min-w-0 flex-1">
                              <Label htmlFor="coins" className="text-[15px] !font-semibold">Use coins</Label>
                              <p className="text-muted-foreground mt-1 text-[13px] text-pretty">
                                <span className="nums">{`${coinBalance} available`}</span>
                                {coinCap && coinBalance > 0 && (coinCap.maxCoins > 0 ? <> · up to <span className="nums">{coinCap.maxCoins}</span> on this order</> : " · can't be used on this order")}
                              </p>
                            </div>
                          </div>
                          {coinCap?.message && coinBalance > 0 && <p className="text-muted-foreground mt-2 pl-12 text-xs text-pretty">{coinCap.message}</p>}
                          {coinBalance > 0 && <ApplyField
                            id="coins"
                            className="mt-3"
                            value={coinsInput}
                            placeholder="0"
                            inputMode="numeric"
                            applyLabel="Apply coins"
                            onChange={(v) => { setCoinsInput(v); if (coinsState.status !== "idle") setCoinsState({ status: "idle" }); }}
                            onApply={applyCoins}
                            state={coinsState}
                            extra={coinCap && Math.min(coinBalance, coinCap.maxCoins) > 0 ? (
                              <button
                                type="button"
                                onClick={() => { setCoinsInput(String(Math.min(coinBalance, coinCap.maxCoins))); setCoinsState({ status: "idle" }); }}
                                className="text-primary h-9 shrink-0 rounded-[10px] px-2.5 text-[13px] font-semibold transition-colors hover:bg-[var(--primary-wash)]"
                              >
                                Max
                              </button>
                            ) : null}
                          />}
                        </div>
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
                void refreshPrice(selections, appliedCode ?? undefined, paymentMethodId, appliedCoins || undefined)
                  .then(() => setPriceFailed(false), () => setPriceFailed(true));
              }}>Continue to payment</Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                className="flex-1 sm:min-h-10 sm:flex-none sm:px-8"
                pending={submitting}
                disabled={submitting || payReason != null}
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

function RowIcon({ tone = "muted", children }: { tone?: "muted" | "wash" | "save"; children: ReactNode }) {
  const toneCls = tone === "save" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400"
    : tone === "wash" ? "bg-[var(--primary-wash)] text-[var(--primary)]"
    : "bg-[var(--muted)] text-[var(--muted-foreground)]";
  return <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full ${toneCls}`}>{children}</span>;
}

// A collapsed "Add a coupon code" row that opens into one field with Apply inside it,
// so the action never sits off-screen and the row costs one line until it's needed.
function CouponEntry({ value, onChange, onApply, state, reveal, suggestions, onPick }: {
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  state: ApplyState;
  reveal: object;
  suggestions: AvailableCoupon[];
  onPick: (code: string) => void;
}) {
  const [open, setOpen] = useState(value !== "" || state.status !== "idle");
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="coupon-entry"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--muted)]"
      >
        <RowIcon tone="wash"><Tag aria-hidden className="size-[18px]" /></RowIcon>
        <span className="flex-1 text-[15px] font-semibold">Add a coupon code</span>
        <Plus aria-hidden className={`text-muted-foreground size-5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-45" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="coupon" id="coupon-entry" {...reveal} className="px-4 pb-4">
            <Label htmlFor="coupon" className="sr-only">Coupon code</Label>
            <ApplyField id="coupon" value={value} placeholder="Enter code" uppercase autoFocus applyLabel="Apply coupon" onChange={onChange} onApply={onApply} state={state} />
          </motion.div>
        )}
      </AnimatePresence>
      {suggestions.length > 0 && (
        <div className="pb-4">
          <p id="coupon-suggestions" className="text-muted-foreground px-4 text-[13px] font-semibold">Available for you</p>
          {/* Edge-to-edge scroller on phones: chips peek past the card padding instead of wrapping into a wall. */}
          <ul aria-labelledby="coupon-suggestions" className="mt-2 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((c) => (
              <li key={c.code} className="shrink-0 snap-start">
                <button
                  type="button"
                  onClick={() => onPick(c.code)}
                  disabled={state.status === "checking"}
                  aria-label={`Apply ${c.code}, ${discountLine(c)}: ${c.name}`}
                  className="flex min-h-14 max-w-[15rem] items-center gap-2.5 rounded-2xl border border-dashed border-[var(--primary)]/50 bg-[var(--primary-wash)] py-2 pr-3.5 pl-3 text-left transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 motion-reduce:active:scale-100"
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold tracking-[0.04em] uppercase">{c.code}</span>
                    <span className="text-muted-foreground block truncate text-[12px]">{c.name}</span>
                  </span>
                  <span className="text-primary shrink-0 text-[13px] font-semibold">{discountLine(c)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// One rounded field with its action inside: the input flexes, the button never shrinks.
function ApplyField({ id, className, value, placeholder, inputMode, uppercase, autoFocus, applyLabel, extra, onChange, onApply, state }: {
  id: string;
  className?: string;
  value: string;
  placeholder: string;
  inputMode?: "numeric";
  uppercase?: boolean;
  autoFocus?: boolean;
  applyLabel: string;
  extra?: ReactNode;
  onChange: (v: string) => void;
  onApply: () => void;
  state: ApplyState;
}) {
  const checking = state.status === "checking";
  return (
    <div className={className}>
      <div className={`flex min-h-12 items-center gap-1 rounded-2xl border bg-[var(--background)] py-1 pr-1 pl-3.5 transition-colors focus-within:border-[var(--primary)] ${state.status === "error" ? "border-[#be123c]" : "border-[var(--border)]"}`}>
        <input
          id={id}
          value={value}
          inputMode={inputMode}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoCapitalize={uppercase ? "characters" : undefined}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={state.status === "error" || undefined}
          aria-describedby={state.status === "applied" || state.status === "error" ? `${id}-msg` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onApply(); } }}
          className={`nums min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--muted-foreground)] ${uppercase ? "uppercase placeholder:normal-case" : ""}`}
        />
        {extra}
        <button
          type="button"
          onClick={onApply}
          disabled={checking || !value.trim()}
          aria-label={applyLabel}
          className="h-10 shrink-0 rounded-xl bg-[var(--foreground)] px-4 text-[14px] font-semibold text-[var(--background)] transition-[opacity,transform] duration-150 active:scale-[0.97] disabled:opacity-35 motion-reduce:active:scale-100"
        >
          {checking ? "Checking…" : "Apply"}
        </button>
      </div>
      {state.status === "applied" && <p id={`${id}-msg`} role="status" className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 dark:text-emerald-400"><Check aria-hidden className="size-4" />{state.message}</p>}
      {state.status === "error" && <p id={`${id}-msg`} role="alert" className="mt-2 text-[13px] font-medium text-[#be123c] dark:text-rose-400">{state.message}</p>}
    </div>
  );
}
