"use client";

import { PaymentInstructions } from "@/components/payment-instructions";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
import { confirmSubscription, payCheckout } from "@/app/(public)/checkout/actions";
import { abandonCard, confirmReturn, newCustomerSession } from "@/app/(customer)/me/pay/[paymentId]/actions";
import { CardPay, CardPayProvider, ExpressPay, PaidSwitch, useWarmStripe, type PaidInfo, type ReceiptView } from "@/components/payments/card-pay";
import { EtransferDialog } from "@/components/payments/etransfer-dialog";
import { PaidPage } from "@/components/payments/paid-page";
import { ReceiptPrinter, type Receipt } from "@/components/payments/receipt-printer";
import { isPaid, markPaid, useBounceAfterPaid } from "@/lib/payments/paid-flag";
import { receiptLines } from "@/lib/payments/receipt-lines";
import { PaymentMethodCards } from "./payment-method-cards";
import type { CardCheckoutContext } from "@/lib/payments/card-checkout-context";
import { TOTAL_CHANGED } from "@/lib/payments/total-changed";
import { billingAddress, e164 } from "@/lib/payments/billing-address";
import type { CardSource } from "@/lib/services/payment-stripe";
import { createWebsiteInquiry } from "@/app/(marketing)/contact/actions";
import { toast } from "sonner";
import { emailSchema, phoneSchema } from "@foundry/commons";
import { firstBlockedStep, pickedAddons, QUOTE_CODES_KEY, reconcileSelections, RENEW_ADDRESS_KEY, RENEW_PAY_KEY, WIZARD_ORIGIN_KEY, WIZARD_STEP_KEY, WIZARD_STORAGE_KEY, type WizardOrigin, type WizardSelections } from "@/components/wizard/selections";
import { OrderSummary, money, startLabel } from "@/components/checkout/order-summary";
import { SubscribeChrome } from "@/components/wizard/subscribe-chrome";
import { Progress } from "@/components/wizard/progress";
import { TotalChip } from "@/components/wizard/total-chip";
import { BottomBar, Button, Label, PillToggle, Sheet } from "@/components/customer/kit";
import { AddressFields } from "@/components/customer/address/address-fields";
import { isFullPostalCode } from "@/lib/catalog/postal";
import { DropOffPicker } from "@/components/customer/address/drop-off";
import { dropOffCatalog, validDropOff, type DropOffValue } from "@/lib/catalog/drop-off";
import type { SavedAddress } from "@foundry/address";
import { CheckoutAddressPicker } from "@/components/checkout/checkout-address-picker";
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

/** reprice answered with a reason (stale cart), as opposed to failing outright. */
class UnpriceableCart extends Error {}

/** True at or above `px`; false on the server and where matchMedia is missing (tests), i.e. the phone layout. */
function useMinWidth(px: number) {
  const q = `(min-width: ${px}px)`;
  return useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const m = window.matchMedia(q);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(q).matches,
    () => false,
  );
}

export function Checkout({
  defaultCountry,
  closeHref = "/me",
  prefill,
  catalog,
  savedAddresses = [],
  addressDropOffs = {},
  suggestedCoupons = [],
  lastTiffin = null,
  cardContext = null,
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
  /** Last tiffin of the customer's running plan(s), so a later start date explains itself. */
  lastTiffin?: string | null;
  /** Stripe card context for the Pay step; null when Stripe isn't set up. */
  cardContext?: CardCheckoutContext | null;
}) {
  const router = useRouter();
  const bouncing = useBounceAfterPaid();
  // Set once confirmSubscription placed an e-Transfer order: the dialog takes over from navigating to /activate.
  const [etransfer, setEtransfer] = useState<{ paymentPublicId: string; deploymentId: string; receipt: Receipt } | null>(null);
  const [etransferOpen, setEtransferOpen] = useState(false);
  const [etransferDone, setEtransferDone] = useState(false);
  const proofSent = useRef(false);
  const markProofSent = useCallback(() => { proofSent.current = true; }, []);
  const dropOff = dropOffCatalog(catalog?.deliveryCharges, catalog?.waivers);
  const defaultAddress = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0] ?? null;
  /** The wizard's saved plan, plus the default address's own drop-off unless this order already chose one. */
  const seed = (raw: string): WizardSelections => {
    const saved = JSON.parse(raw) as WizardSelections;
    const parsed = catalog ? reconcileSelections(catalog, saved) : saved;
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
  // Typed codes that landed in the price; several can stack, each removable on its own.
  const [appliedCodes, setAppliedCodes] = useState<string[]>([]);
  const [applied, setApplied] = useState<AppliedCoupon[]>([]);
  const [couponState, setCouponState] = useState<{ status: "idle" | "checking" | "applied" | "error"; message?: string }>({ status: "idle" });
  const [coinsInput, setCoinsInput] = useState("");
  const [appliedCoins, setAppliedCoins] = useState(0);
  const [coinsApplied, setCoinsApplied] = useState<{ coins: number; amount: number } | null>(null);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [coinsToEarn, setCoinsToEarn] = useState<number | null>(null);
  const [coinCap, setCoinCap] = useState<RepriceResult["coinCap"]>(null);
  const [coinsState, setCoinsState] = useState<{ status: "idle" | "checking" | "applied" | "error"; message?: string }>({ status: "idle" });
  const [waitlisted, setWaitlisted] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<CheckoutPaymentMethod[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  // Payment methods arrive with the price; if that load fails the payment step offers a retry.
  const [priceFailed, setPriceFailed] = useState(false);
  // The server's reason this cart can't be priced; Retry can't fix it, Edit plan can.
  const [priceError, setPriceError] = useState<string | null>(null);
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
  // Stripe.js loads while the customer is still on the address step, so the wallet button is ready on Pay.
  useWarmStripe(cardContext?.publishableKey);
  const [cardDialog, setCardDialog] = useState(false);
  // Desktop (lg) puts Savings beside the order card; phones (below sm) pay from the bottom bar.
  const wide = useMinWidth(1024);
  const phone = !useMinWidth(640);
  const prevStep = useRef(step);
  // The card payment placed for these exact inputs. A retry reuses it; any input change drops it
  // (the server re-checks the match too, this just avoids sending a stale id).
  const wantPay = useRef(false);
  const renewRead = useRef(false);
  const renewAddrPick = useRef<SavedAddress | undefined>(undefined);
  const placed = useRef<{ paymentPublicId: string; deploymentId: string } | null>(null);
  useEffect(() => {
    placed.current = null;
  }, [selections, appliedCodes, appliedCoins, paymentMethodId, contact, addressPublicId]);

  useEffect(() => {
    if (prevStep.current !== step) window.scrollTo({ top: 0 });
    prevStep.current = step;
  }, [step]);

  const refreshPriceInner = async (
    s: WizardSelections,
    codes: string[] | undefined,
    methodId: string | null,
    coins?: number,
    postalCode = contact.postalCode,
    addr: { addressLine?: string; city?: string } = contact,
  ) => {
    // Postal code drives province sales tax, so the receipt must be re-priced
    // with it — otherwise the preview total would omit tax the order charges.
    const r = await reprice(s, codes?.length ? codes : undefined, s.planKey ?? undefined, methodId, coins, postalCode || undefined, addr.addressLine || undefined, addr.city || undefined);
    if ("error" in r) {
      setPriceError(r.error);
      throw new UnpriceableCart(r.error);
    }
    setPriceError(null);
    setResult(r.pricing);
    setApplied(r.appliedCoupons);
    setPaymentMethods(r.paymentMethods);
    setCoinBalance(r.coinBalance);
    setCoinsToEarn(r.coinsToEarn);
    setCoinCap(r.coinCap);
    setCoinsApplied(r.coinsApplied ?? null);
    // Auto-pick the first enabled method when none chosen yet.
    if (!methodId && r.paymentMethods.length > 0) {
      // Card is the default when it can be paid in place.
      const first = r.paymentMethods.find((m) => m.id === "stripe" && cardContext?.publishableKey) ?? r.paymentMethods[0]!;
      setPaymentMethodId(first.id);
      return refreshPriceInner(s, codes, first.id, coins, postalCode, addr);
    }
    return r;
  };

  const [repricing, setRepricing] = useState(0);
  const refreshPrice = async (...args: Parameters<typeof refreshPriceInner>) => {
    setRepricing((n) => n + 1);
    try {
      return await refreshPriceInner(...args);
    } finally {
      setRepricing((n) => n - 1);
    }
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

  const phoneValid = phoneSchema().safeParse(contact.phone.trim()).success;
  const emailValid = emailSchema.safeParse(contact.email.trim()).success;
  const step1Reason = !contact.fullName.trim() ? "Add your name in Account to continue."
    : !emailValid ? "Add an email in Account to continue."
    : !contact.postalCode ? "Add your delivery address to continue."
    : !isFullPostalCode(contact.postalCode) ? "Enter your full postal code, like M5V 2T6."
    : zone != null && !zone.served ? "We don't deliver to this postal code yet. Join the waitlist above."
    : !phoneValid ? "Add your phone number to continue."
    : null;
  // Quick Renew arrives with its plan, address and contact settled: open on Pay once the zone check lands.
  useEffect(() => {
    if (!wantPay.current || !selections || !zone) return;
    // A failed zone check must not leave the intent armed for a later address change.
    if (!zone.served) { wantPay.current = false; return; }
    if (step1Reason == null) {
      wantPay.current = false;
      setStep(2);
    }
  }, [selections, zone, step1Reason]);

  useEffect(() => {
    // markPaid clears the wizard storage; once paid, the receipt stays on screen and a re-run of this
    // effect (router identity change) must not read the empty storage as "no selections".
    if (isPaid()) return;
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) { router.replace("/subscribe"); return; }
    if (prefill == null) { router.replace("/subscribe"); return; }
    const s = selections ?? seed(raw);
    const storedOriginKey = sessionStorage.getItem(WIZARD_ORIGIN_KEY);
    // The catalog dropped something this cart needs (a meal size, a frequency): it can't be
    // priced, so send the customer to the wizard step that asks for it instead of a dead end.
    const blockedAt = catalog ? firstBlockedStep(catalog, s) : null;
    if (blockedAt != null) {
      sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(s));
      sessionStorage.setItem(WIZARD_STEP_KEY, String(blockedAt));
      router.replace(storedOriginKey === "renew" ? "/me/renew" : storedOriginKey === "trial" ? "/me/trial" : "/subscribe");
      return;
    }
    // A full page load seeds here: sessionStorage is only readable on the client, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selections) setSelections(s);
    if (sessionStorage.getItem(WIZARD_ORIGIN_KEY) === "renew") setOrigin("renew");
    if (sessionStorage.getItem(WIZARD_ORIGIN_KEY) === "trial") setOrigin("trial");
    // Codes from a staff estimate link go in with the first price; a code that doesn't land (expired,
    // used, beaten by a better one) is dropped and named, so the total shown is the one charged.
    let quoted: string[] = [];
    try { quoted = JSON.parse(sessionStorage.getItem(QUOTE_CODES_KEY) ?? "[]") as string[]; } catch { /* unreadable: no codes */ }
    // Quick Renew's one-shot flags: read once so a reload lands back on step 1.
    if (!renewRead.current) {
      renewRead.current = true;
      const renewPay = storedOriginKey === "renew" && sessionStorage.getItem(RENEW_PAY_KEY) === "1";
      const renewAddrId = renewPay ? sessionStorage.getItem(RENEW_ADDRESS_KEY) : null;
      sessionStorage.removeItem(RENEW_PAY_KEY);
      sessionStorage.removeItem(RENEW_ADDRESS_KEY);
      if (renewPay) wantPay.current = true;
      renewAddrPick.current = renewAddrId ? savedAddresses.find((a) => a.publicId === renewAddrId) : undefined;
    }
    const renewAddr = renewAddrPick.current;
    if (renewAddr) {
      setAddressPublicId(renewAddr.publicId);
      setContact((c) => ({ ...c, ...addressFields(renewAddr) }));
      handleDropOffChange(validDropOff(dropOff, addressDropOffs[renewAddr.publicId]));
    }
    const priceAddr = renewAddr ?? contact;
    refreshPrice(s, quoted, null, undefined, priceAddr.postalCode, priceAddr).then(
      async (r) => {
        sessionStorage.removeItem(PRICE_RELOAD_KEY);
        if (!quoted.length) return;
        sessionStorage.removeItem(QUOTE_CODES_KEY);
        const kept = quoted.filter((c) => r.appliedCoupons.some((a) => a.code.toUpperCase() === c));
        if (kept.length !== quoted.length) await refreshPrice(s, kept, null).catch(() => undefined);
        setAppliedCodes(kept);
        const dropped = quoted.filter((c) => !kept.includes(c));
        setCouponState(dropped.length
          ? { status: "error", message: `${dropped.join(", ")} couldn't be applied to this plan` }
          : { status: "applied", message: kept.length > 1 ? "Your estimate's coupons are applied" : "Your estimate's coupon is applied" });
      },
      (err) => {
        if (err instanceof UnpriceableCart) { sessionStorage.removeItem(PRICE_RELOAD_KEY); setResult(null); return; }
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
    const checked = renewAddr ?? defaultAddress;
    if (checked) void checkPostal(checked.postalCode, false, checked);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const checkPostal = async (postalCode = contact.postalCode, withPrice = true, addr: { addressLine?: string; city?: string } = contact) => {
    if (!postalCode.trim()) return;
    const res = await validatePostal(postalCode);
    setZone(res.served ? { served: true, name: res.zone!.name, slotWindow: res.zone!.slotWindow } : { served: false });
    // A served address fixes the province, so the total shown from here on includes its tax.
    if (res.served && withPrice && selections) {
      void refreshPrice(selections, appliedCodes, paymentMethodId, appliedCoins || undefined, postalCode, addr).catch(() => undefined);
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
    if (next.postalCode) void checkPostal(next.postalCode, true, next);
  };

  const saveEditor = () => {
    if (!editor) return;
    setDraft(editor);
    setAddressPublicId(null);
    setContact((c) => ({ ...c, ...editor }));
    setZone(null);
    void checkPostal(editor.postalCode, true, editor);
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

  const applyCoupon = async (picked?: string, methodId: string | null = paymentMethodId) => {
    if (!selections) return;
    if (picked) setCouponCode(picked);
    const code = (picked ?? couponCode).trim().toUpperCase();
    if (!code) {
      setCouponState({ status: "idle" });
      return;
    }
    if (appliedCodes.includes(code)) {
      setCouponState({ status: "applied", message: "That code is already applied" });
      return;
    }
    setCouponState({ status: "checking" });
    const tried = [...appliedCodes, code];
    const r = await refreshPrice(selections, tried, methodId, appliedCoins || undefined);
    const error = r.couponErrors ? r.couponErrors.find((e) => e.code === code)?.error : r.couponError;
    // A refused code, or one a better combination beat, is not kept: price again without it
    // so the total on screen is what the order will charge.
    const left = r.couponsNotApplied?.find((n) => n.code.toUpperCase() === code)?.reason;
    const inSet = r.appliedCoupons.some((c) => c.code.toUpperCase() === code);
    if (error || !inSet) {
      await refreshPrice(selections, appliedCodes, methodId, appliedCoins || undefined);
      setCouponState(error ? { status: "error", message: error } : { status: "applied", message: left ?? "A better discount is already applied" });
      return;
    }
    setAppliedCodes(tried);
    setCouponCode("");
    setCouponState({ status: "idle" });
  };

  // Offer every listed code at once; the server keeps the best combination, and anything it
  // left out is dropped so the codes shown are the ones the order will use.
  const applyAllCoupons = async (codes: string[]) => {
    if (!selections) return;
    const tried = [...appliedCodes, ...codes.map((c) => c.toUpperCase()).filter((c) => !appliedCodes.includes(c))];
    setCouponState({ status: "checking" });
    const r = await refreshPrice(selections, tried, paymentMethodId, appliedCoins || undefined);
    const kept = tried.filter((c) => r.appliedCoupons.some((a) => a.code.toUpperCase() === c));
    if (kept.length !== tried.length) await refreshPrice(selections, kept, paymentMethodId, appliedCoins || undefined);
    setAppliedCodes(kept);
    const added = kept.length - appliedCodes.filter((c) => kept.includes(c)).length;
    const refused = r.couponErrors?.[0];
    setCouponState(added > 0
      ? { status: "idle" }
      : refused
        ? { status: "error", message: `${refused.code}: ${refused.error}` }
        : { status: "applied", message: "None of these coupons lowers this order" });
  };

  const removeCoupon = async (code: string) => {
    if (!selections) return;
    const next = appliedCodes.filter((c) => c !== code.toUpperCase());
    setAppliedCodes(next);
    setCouponState({ status: "idle" });
    await refreshPrice(selections, next, paymentMethodId, appliedCoins || undefined);
  };

  const removeCoins = async () => {
    if (!selections) return;
    setCoinsInput("");
    setAppliedCoins(0);
    setCoinsState({ status: "idle" });
    await refreshPrice(selections, appliedCodes, paymentMethodId, undefined);
  };

  const applyCoins = async () => {
    if (!selections) return;
    const requested = Number(coinsInput.trim());
    if (!coinsInput.trim() || !Number.isFinite(requested) || requested <= 0) {
      setAppliedCoins(0);
      setCoinsState({ status: "idle" });
      await refreshPrice(selections, appliedCodes, paymentMethodId, undefined);
      return;
    }
    setCoinsState({ status: "checking" });
    const r = await refreshPrice(selections, appliedCodes, paymentMethodId, requested);
    if (r.coinsError) {
      setAppliedCoins(0);
      setCoinsState({ status: "error", message: r.coinsError });
      return;
    }
    setAppliedCoins(requested);
    setCoinsState({ status: "applied", message: "Coins applied" });
  };

  const choose = (choice: string) => {
    if (choice === "stripe") setCardDialog(true);
    if (choice !== paymentMethodId) void selectMethod(choice);
  };

  const selectMethod = async (id: string) => {
    if (!selections) return;
    setPaymentMethodId(id);
    const r = await refreshPrice(selections, appliedCodes, id, appliedCoins || undefined);
    // A code tied to another payment method drops out here; say so rather than letting it vanish.
    const refused = (r.couponErrors ?? []).filter((e) => appliedCodes.includes(e.code));
    if (refused.length) {
      const keep = appliedCodes.filter((c) => !refused.some((e) => e.code === c));
      setAppliedCodes(keep);
      await refreshPrice(selections, keep, id, appliedCoins || undefined);
      setCouponState({ status: "error", message: `${refused.map((e) => e.code).join(", ")} removed: ${refused[0]!.error.toLowerCase()}` });
    }
  };

  const handleAddressTagSelect = (tagId: string) => {
    if (!selections) return;
    const next = { ...selections, addressTagId: tagId === selections.addressTagId ? null : tagId };
    setSelections(next);
    void refreshPrice(next, appliedCodes, paymentMethodId, appliedCoins || undefined);
  };

  function handleDropOffChange(value: DropOffValue) {
    if (!selections) return;
    const current = selections.deliveryStrategyIds ?? [];
    const same = value.tagId === (selections.deliveryTagId ?? null)
      && value.strategyIds.length === current.length && value.strategyIds.every((p) => current.includes(p));
    if (same) return;
    const next = { ...selections, deliveryTagId: value.tagId, deliveryStrategyIds: value.strategyIds };
    setSelections(next);
    void refreshPrice(next, appliedCodes, paymentMethodId, appliedCoins || undefined);
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
        couponCodes: appliedCodes,
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
      if (paymentMethodId === "etransfer" && result) {
        const total = Math.round(result.total * 100);
        setEtransfer({
          paymentPublicId: res.paymentPublicId,
          deploymentId: res.deploymentId,
          receipt: {
            title: meal?.name ?? "Your plan",
            subtitle: baseline ?? null,
            lines: receiptLines({ totalCents: total, taxCents: Math.round(result.taxTotal * 100), feeCents: 0 }),
            total,
            orderRef: res.deploymentId,
            paidWith: "e-Transfer",
            paidAt: Date.now(),
          },
        });
        setEtransferOpen(true);
        return;
      }
      router.push(paymentMethodId === "stripe" ? `/me/pay/${res.paymentPublicId}` : `/activate/${res.deploymentId}`, { transitionTypes: ["nav-forward"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!selections || bouncing) return null;

  const payByCard = async (source: CardSource, acceptSurcharge: boolean) => {
    const res = await payCheckout({
      selections,
      planKey: selections.planKey!,
      contact,
      addressPublicId,
      renewal: lockContact,
      couponCodes: appliedCodes,
      coins: appliedCoins || undefined,
      paymentMethodId: "stripe",
      expectedAmountCents: Math.round(result!.total * 100),
      paymentPublicId: placed.current?.paymentPublicId ?? null,
      source,
      acceptSurcharge,
    });
    if ("error" in res) {
      // The server priced differently: show its total so the next Pay sends that one.
      if (res.error === TOTAL_CHANGED) void refreshPrice(selections, appliedCodes, paymentMethodId, appliedCoins || undefined).catch(() => undefined);
      return { error: res.error };
    }
    placed.current = { paymentPublicId: res.paymentPublicId, deploymentId: res.deploymentId };
    return res.result;
  };
  const cardReceipt = (info: PaidInfo): ReceiptView => {
    const total = info.totalCents ?? Math.round((result?.total ?? 0) * 100);
    const id = placed.current?.deploymentId ?? "";
    return {
      receipt: {
        title: meal?.name ?? "Your plan",
        subtitle: baseline ?? null,
        lines: receiptLines({ totalCents: total, taxCents: Math.round((result?.taxTotal ?? 0) * 100), feeCents: info.feeCents }),
        total,
        orderRef: id,
        paidWith: info.paidWith,
        paidAt: Date.now(),
      },
    };
  };
  const settledCard = () => { if (placed.current) markPaid(placed.current.deploymentId); };

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

  const goBack = () => (step > 1 ? setStep(1) : router.push(editHref, { transitionTypes: ["nav-back"] }));
  const backLabel = step > 1 ? "Back" : "Edit plan";
  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId) ?? null;
  const cardOn = cardContext?.publishableKey != null && result != null;
  const payWithCard = cardOn && paymentMethodId === "stripe";
  const realPayments = paymentMethods.length > 0;
  // Simulated payment is local-only; in prod an empty list just means not loaded yet
  // (the page shows a sorry screen when no rail is enabled at all).
  const simulated = !realPayments && result != null && process.env.NODE_ENV !== "production";
  const payReason = realPayments ? (paymentMethodId ? null : "Choose a payment method to confirm.")
    : simulated ? null
    : priceError ? `${priceError}. Tap Edit plan to fix it.`
    : priceFailed ? "Couldn't load payment options. Tap Retry."
    : "Loading payment options…";
  // Reload, not re-call: after a deploy the same stale Server Action id fails every time.
  const retryPrice = () => window.location.reload();
  const actionReason = step === 1 ? step1Reason : payReason;
  const addressLine = oneLine(contact);
  // Pay step only: step 1 is where these are edited, so the order card would just repeat them there.
  const deliverTo = step === 2 && addressLine
    ? {
        address: addressLine,
        window: zone?.slotWindow ?? null,
        phone: formatPhoneNumberIntl(contact.phone) || contact.phone || null,
        onChange: () => { setSummaryOpen(false); setStep(1); },
      }
    : undefined;
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
  // A trial stores its picked days in eatingDays too; that isn't a weekly rate.
  const perWeek = selections.trialDays == null ? (selections.eatingDays?.length ?? 0) : 0;
  const start = startLabel(selections.startDate);
  const startNote = start && lastTiffin && selections.startDate > lastTiffin
    ? `Current plan ends ${startLabel(lastTiffin)}.`
    : null;

  const sign = step === 2 ? 1 : -1;
  const slide = reduce ? 0 : 24;
  const spring = reduce ? { duration: 0.15 } : { type: "spring" as const, bounce: 0, duration: 0.4 };
  const reveal = { initial: { opacity: 0, y: reduce ? 0 : 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: spring };

  const summary = (plain = false) => (
    <OrderSummary plain={plain} selections={selections} result={result} mealName={meal?.name} addons={pickedAddons(catalog, selections)} baseline={baseline} deliveryType={deliveryType} startNote={startNote} editHref={editHref} deliverTo={deliverTo} />
  );

  const cardPay = <CardPay dialogOpen={cardDialog} onDialogOpenChange={setCardDialog} />;
  const savingsSection = (
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
                  <button type="button" onClick={() => void removeCoupon(c.code)} aria-label={`Remove coupon ${c.code}`} className="text-muted-foreground -mr-2 grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--muted)] active:scale-[0.94] motion-reduce:active:scale-100">
                    <X aria-hidden className="size-[18px]" />
                  </button>
                )}
              </motion.div>
            ))}
            {coinsApplied && (
              <motion.div key="coins" {...reveal} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <RowIcon tone="save"><Coins aria-hidden className="size-[18px]" /></RowIcon>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">Coins</p>
                  <p className="nums text-muted-foreground truncate text-[13px]">{coinsApplied.coins} coins used</p>
                </div>
                <span className="nums shrink-0 text-[15px] font-semibold text-emerald-700 dark:text-emerald-400">−{money(coinsApplied.amount)}</span>
                <button type="button" onClick={() => void removeCoins()} aria-label="Remove coins" className="text-muted-foreground -mr-2 grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--muted)] active:scale-[0.94] motion-reduce:active:scale-100">
                  <X aria-hidden className="size-[18px]" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <CouponEntry
            value={couponCode}
            onChange={(v) => { setCouponCode(v); if (couponState.status !== "idle") setCouponState({ status: "idle" }); }}
            onApply={() => applyCoupon()}
            state={couponState}
            reveal={reveal}
            suggestions={suggestedCoupons.filter((c) => !applied.some((a) => a.code.toUpperCase() === c.code.toUpperCase()))}
            onPick={(code) => void applyCoupon(code)}
            onApplyAll={(codes) => void applyAllCoupons(codes)}
            appliedCount={applied.length}
            onSwitchMethod={async (id, code) => { await selectMethod(id); await applyCoupon(code, id); }}
            methodName={(id) => (id === "stripe" ? "Card" : paymentMethods.find((m) => m.id === id)?.label ?? id)}
          />
          {/* Checkout is signed-in only; a null balance means the price load failed, not a guest. */}
          {coinBalance == null || coinBalance === 0 ? null : (
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
  );

  const payStepBody = (
    <div className="space-y-10">
      <section aria-labelledby="co-pay">
        <h2 id="co-pay" className={H}>Pay with</h2>
        {realPayments ? (
          <div className="mt-3 flex flex-col gap-3">
            <PaymentMethodCards
              methods={paymentMethods}
              value={paymentMethodId ?? ""}
              onChange={choose}
              labelledBy="co-pay"
              feeNote={cardContext?.feeNote}
            />
            {/* Below the cards: its slot can't push them around while Stripe loads. */}
            {/* Outside the cards: the copy button can't nest inside a label. */}
            <AnimatePresence initial={false}>
              {selectedMethod && (selectedMethod.payeeHandle || selectedMethod.instructions) && (
                <motion.div key={selectedMethod.id} {...reveal} className="px-4">
                  <PaymentInstructions payeeHandle={selectedMethod.payeeHandle} instructions={selectedMethod.instructions} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          simulated ? (
            <p className="text-muted-foreground mt-3 text-sm">Simulated, no real charge (local only).</p>
          ) : priceError ? (
            <div role="alert" className="mt-3 flex items-center justify-between gap-3">
              <p className="text-destructive text-sm text-pretty">{priceError}</p>
              <Button pill variant="quiet" className="!min-h-11 !shrink-0 !px-5" onClick={() => router.push(editHref, { transitionTypes: ["nav-back"] })}>Edit plan</Button>
            </div>
          ) : priceFailed ? (
            <div role="alert" className="mt-3 flex items-center justify-between gap-3">
              <p className="text-destructive text-sm">Couldn&apos;t load payment options.</p>
              <Button pill variant="quiet" className="!min-h-11 !px-5" onClick={retryPrice}>Retry</Button>
            </div>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm">Loading payment options…</p>
          )
        )}
        {selectedMethod && !payWithCard && (
          <p className="text-muted-foreground mt-3 flex items-start gap-2 text-[13px] text-pretty">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            Your plan is reserved now. Deliveries start once we confirm payment{selectedMethod.id === "etransfer" ? ", usually within a business day" : ""}.
          </p>
        )}
      </section>

      {coinsToEarn ? (
        <p className="text-muted-foreground -mt-6 px-1 text-[13px]">
          You&apos;ll earn ~<span className="nums">{coinsToEarn}</span> coins when this order is paid
        </p>
      ) : null}

      {!wide && savingsSection}

    </div>
  );

  const page = (
    <div className="pb-[calc(var(--bottom-bar-h,11rem)+1rem)] sm:pb-10">
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
                address={deliverTo?.address}
                total={result?.total}
                saved={result?.adjustments.reduce((n, a) => n + a.amount, 0)}
                onOpen={() => setSummaryOpen(true)}
              />
              {startNote && <p className="text-muted-foreground -mt-3 mb-6 px-1 text-[13px] text-pretty">{startNote}</p>}

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
              ) : payStepBody}
            </motion.div>
          </AnimatePresence>

          {/* Card step: wallet and card action live here at every width, like Continue on the Delivery step. */}
          <BottomBar
            alignEnd
            note={step === 2 && payWithCard && phone && result ? undefined : (actionReason ?? undefined)}
            className="sm:sticky sm:mt-8 sm:px-0"
          >
            {step === 2 && payWithCard ? (
              // Wallet full width above one row: Back left, Pay right (as Continue on the Delivery step).
              <div className="flex w-full flex-col gap-2">
                {phone && result && <p role="status" className="nums text-[15px] font-semibold sm:text-right">Total {money(result.total)}</p>}
                <div className="min-h-[50px]"><ExpressPay height={50} /></div>
                <div className="flex items-start gap-2">
                  <Button variant="quiet" size="lg" className="w-28 shrink-0" onClick={goBack}>{backLabel}</Button>
                  <div className="min-w-0 flex-1 sm:ml-auto sm:w-60 sm:flex-none">{cardPay}</div>
                </div>
              </div>
            ) : (
              <Button variant="quiet" size="lg" className="w-28 shrink-0 sm:hidden" onClick={goBack}>{backLabel}</Button>
            )}
            {step === 1 ? (
              <Button variant="primary" size="lg" className="flex-1 sm:min-h-10 sm:flex-none sm:px-8" disabled={step1Reason != null} onClick={() => {
                setStep(2);
                // The address is final now — re-price so tax reflects its province.
                void refreshPrice(selections, appliedCodes, paymentMethodId, appliedCoins || undefined)
                  .then(() => setPriceFailed(false), () => setPriceFailed(true));
              }}>Continue to payment</Button>
            ) : payWithCard ? null : (
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

        <aside aria-label="Order summary" className="hidden md:sticky md:top-24 md:flex md:flex-col md:gap-6">
          {summary()}
          {step === 2 && wide && savingsSection}
        </aside>
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
  // The settled state keeps the checkout shell (header, progress, bottom bar); the receipt already carries the order, so no summary column.
  const paidLayout = (kind: "paid" | "processing" | "submitted", receipt: ReactNode, ready: boolean, primary: { label: string; href: string }, secondary?: { label: string; href: string }) => (
    <div className="pb-[calc(var(--bottom-bar-h,11rem)+1rem)] sm:pb-10">
      <SubscribeChrome brand closeHref="/me/deliveries" onBack={() => router.replace("/me/deliveries")} backLabel="Deliveries" stepTag="Paid" />
      <div className="mx-auto max-w-xl">
        <Progress steps={STEPS} current={STEPS.length - 1} />
        <PaidPage
          kind={kind}
          subtitle={kind === "processing" ? "We'll confirm by email." : kind === "submitted" ? "We'll verify your e-Transfer and email you." : start ? `Your first tiffin arrives ${start}.` : "We've emailed your receipt."}
          receipt={receipt}
          ready={ready}
          primary={primary}
          secondary={secondary}
          barClassName="sm:sticky sm:mt-8 sm:px-0"
        />
      </div>
    </div>
  );
  const withDialog = etransfer && etransferDone ? paidLayout(
    "submitted",
    <ReceiptPrinter stage="complete" receipt={etransfer.receipt} status="Submitted · we'll verify your e-Transfer" />,
    true,
    { label: "Go to my dashboard", href: "/me" },
  ) : (
    <>
      {page}
      {etransfer && (
        <EtransferDialog
          open={etransferOpen}
          onOpenChange={(open) => {
            setEtransferOpen(open);
            if (!open && proofSent.current) router.replace("/me/deliveries");
          }}
          payment={{
            paymentPublicId: etransfer.paymentPublicId,
            deploymentId: etransfer.deploymentId,
            amount: etransfer.receipt.total / 100,
            payeeHandle: selectedMethod?.payeeHandle ?? null,
            instructions: selectedMethod?.instructions ?? null,
            requireProof: selectedMethod?.requireProof === true,
          }}
          renderSubmitted={() => <EtransferSubmitted deploymentId={etransfer.deploymentId} onSent={() => { markProofSent(); setEtransferDone(true); }} />}
          onClosedWithoutProof={() => {
            toast("You can upload the screenshot later from Finances");
            router.replace(`/activate/${etransfer.deploymentId}`);
          }}
        />
      )}
    </>
  );
  // Mounted for the whole checkout (Stripe needs it for the phone pay bar too); the key never changes, so no remounts.
  return cardContext?.publishableKey ? (
    <CardPayProvider
      // Step 1's phone and address are this order's, so they are the card's billing details too.
      ctx={{ ...cardContext!, prefill: { ...cardContext!.prefill, phone: e164(contact.phone, cardContext!.prefill.address.country) ?? cardContext!.prefill.phone, address: billingAddress(contact, cardContext!.prefill.address.country) } }}
      amountCents={result ? Math.round(result.total * 100) : 50}
      disabled={repricing > 0 || result == null}
      onPay={payByCard}
      customerSession={newCustomerSession}
      onPaid={settledCard}
      onProcessing={settledCard}
      receipt={cardReceipt}
      abandon={async () => { if (placed.current) await abandonCard(placed.current.paymentPublicId); }}
      afterAction={async () => {
        const r = placed.current ? await confirmReturn(placed.current.paymentPublicId) : null;
        return r && !("error" in r) && r.paid ? { outcome: "paid" as const, receipt: r.receipt } : { outcome: "processing" as const };
      }}
    >
      <PaidSwitch whenPaid={(v) => paidLayout(v.outcome === "paid" ? "paid" : "processing", v.receipt, v.ready, v.primary, v.secondary)}>{withDialog}</PaidSwitch>
    </CardPayProvider>
  ) : withDialog;
}

/** Rendered by the dialog once the proof is in: flags the order as paid-for so Back cannot return to checkout, then hands over to the page. */
function EtransferSubmitted({ deploymentId, onSent }: { deploymentId: string; onSent: () => void }) {
  useEffect(() => {
    markPaid(deploymentId);
    onSent();
  }, [deploymentId, onSent]);
  return null;
}

/** Mobile only: what's being ordered, above every step. Taps open the full summary. */
function OrderGlance({ title, baseline, meta, address, total, saved, onOpen }: { title: string; baseline?: string | null; meta: string; address?: string; total?: number; saved?: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="bg-card border-border mb-8 flex w-full items-center gap-3 rounded-[20px] border p-4 text-left transition-transform duration-100 active:scale-[0.98] motion-reduce:active:scale-100 md:hidden"
    >
      <span className="min-w-0 flex-1">
        <span className="text-muted-foreground block text-xs font-semibold tracking-[0.02em]">Your order</span>
        <span className="mt-0.5 line-clamp-2 block text-[17px] leading-snug font-semibold tracking-[-0.02em] text-balance">
          {baseline ? `${title} · ${baseline}` : title}
        </span>
        {meta && <span className="text-muted-foreground block truncate text-[13px]">{meta}</span>}
        {address && <span className="text-muted-foreground block truncate text-[13px]">To {address}</span>}
      </span>
      {total != null && (
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="nums text-[17px] font-bold">{money(total)}</span>
          {saved ? <span className="nums rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400">Saved {money(saved)}</span> : null}
        </span>
      )}
      <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0" />
    </button>
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
function CouponEntry({ value, onChange, onApply, state, reveal, suggestions, onPick, onApplyAll, methodName, appliedCount, onSwitchMethod }: {
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  state: ApplyState;
  reveal: object;
  suggestions: AvailableCoupon[];
  onPick: (code: string) => void;
  onApplyAll: (codes: string[]) => void;
  methodName: (id: string) => string;
  appliedCount: number;
  onSwitchMethod: (methodId: string, code: string) => void;
}) {
  const [open, setOpen] = useState(value !== "" || state.status !== "idle");
  const [focusField, setFocusField] = useState(false);
  const lastCount = useRef(appliedCount);
  // A new applied row is the confirmation: fold the entry away.
  useEffect(() => {
    if (appliedCount > lastCount.current) { setOpen(false); setFocusField(false); }
    lastCount.current = appliedCount;
  }, [appliedCount]);
  const typed = value.trim().toUpperCase();
  const gated = state.status === "error" && state.message === "This coupon is not valid for the selected payment method"
    ? suggestions.find((c) => c.code.toUpperCase() === typed && c.allowedPaymentMethods.length > 0)
    : undefined;
  const gatedMethod = gated?.allowedPaymentMethods[0];
  const errorMessage = state.status === "error"
    ? state.message === "Invalid coupon code" && suggestions.length > 0 ? `${state.message}. Check the spelling, or pick one below.` : state.message
    : undefined;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="coupon-entry"
        onClick={() => { setFocusField(!open); setOpen((o) => !o); }}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--muted)]"
      >
        <RowIcon tone="wash"><Tag aria-hidden className="size-[18px]" /></RowIcon>
        <span className="flex-1 text-[15px] font-semibold">Add a coupon code</span>
        <Plus aria-hidden className={`text-muted-foreground size-5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-45" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {(open || state.status !== "idle") && (
          <motion.div key="coupon" id="coupon-entry" {...reveal} className="px-4 pb-4">
            <Label htmlFor="coupon" className="sr-only">Coupon code</Label>
            <ApplyField id="coupon" value={value} placeholder="Enter code" uppercase autoFocus={focusField} applyLabel="Apply coupon" onChange={onChange} onApply={onApply} state={gated ? { status: "idle" } : errorMessage ? { status: "error", message: errorMessage } : state} />
            {gated && gatedMethod && (
              <p role="alert" className="text-destructive mt-2 text-[13px] font-medium">
                {gated.code} works with {methodName(gatedMethod)} only.{" "}
                <button type="button" onClick={() => onSwitchMethod(gatedMethod, gated.code)} className="text-primary -my-3 min-h-11 font-semibold underline underline-offset-2">Pay with {methodName(gatedMethod)}</button>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {suggestions.length > 0 && (
        <div className="pb-4">
          <div className="flex items-center justify-between gap-3 px-4">
            <p id="coupon-suggestions" className="text-muted-foreground text-[13px] font-semibold">Available for you</p>
            {suggestions.length > 1 && (
              <button
                type="button"
                onClick={() => onApplyAll(suggestions.map((c) => c.code))}
                disabled={state.status === "checking"}
                className="text-primary -mr-2 min-h-11 rounded-full px-2 text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-50 motion-reduce:active:scale-100"
              >
                Apply all applicable
              </button>
            )}
          </div>
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
                    <span className="text-muted-foreground block truncate text-[12px]">
                      {c.allowedPaymentMethods.length ? `${c.allowedPaymentMethods.map(methodName).join(" or ")} only` : c.minSubtotal != null ? `On orders ${money(Number(c.minSubtotal)).replace(/\.00$/, "")}+` : c.name}
                    </span>
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
      <div className={`flex min-h-12 items-center gap-1 rounded-2xl border bg-[var(--background)] py-1 pr-1 pl-3.5 transition-colors focus-within:border-[var(--primary)] ${state.status === "error" ? "border-destructive" : "border-[var(--border)]"}`}>
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
      {state.status === "error" && <p id={`${id}-msg`} role="alert" className="text-destructive mt-2 text-[13px] font-medium">{state.message}</p>}
    </div>
  );
}
