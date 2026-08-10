"use client";

import { useCallback, useId, useState } from "react";
import { Btn, Pill } from "@/components/brutal/shared";
import { CartLines } from "@/components/cart/cart-lines";
import { useCart } from "@/components/cart/cart-provider";
import { AddressAutocomplete } from "@/components/order/address-autocomplete";
import { CloverCardForm } from "@/components/order/clover-card-form";
import { DeliveryTypePicker, type CheckoutDeliveryType } from "@/components/order/delivery-type-picker";
import { DiscountPicker, type PublicOffer } from "@/components/order/discount-picker";
import { OrderSummary } from "@/components/order/order-summary";
import { DEFAULT_DIAL_CODE, joinPhone, PhoneField } from "@/components/order/phone-field";
import { StaticMap } from "@/components/map/static-map";
import { money } from "@/lib/cart/types";
import { useCartQuote, type DiscountSelection } from "@/lib/cart/use-cart-quote";
import { DEFAULT_STORE_LAT, DEFAULT_STORE_LNG } from "@/lib/delivery/distance";

type CheckoutSession = {
  orderPublicId: string;
  cloverOrderId: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  customerEmail: string;
  pakmsKey: string;
  checkoutSdkUrl: string;
  environment: "sandbox" | "production";
  fulfillment: "pickup" | "delivery_instant" | "delivery_scheduled";
  discountAmount?: number;
  scheduledFor?: string;
};

type Step = "review" | "pay" | "done";
type Fulfillment = "pickup" | "delivery";
type FieldKey = "name" | "email" | "phone" | "address" | "deliveryType" | "scheduledFor";
type AddressCheck =
  | {
      resolved: true;
      formattedAddress: string;
      lat: number;
      lng: number;
      distanceKm: number;
      limitKm: number | null;
      types: CheckoutDeliveryType[];
    }
  | { resolved: false; error?: boolean };

const STEPS: { key: Step; label: string }[] = [
  { key: "review", label: "Details" },
  { key: "pay", label: "Payment" },
  { key: "done", label: "Done" },
];

function StepTrack({ step }: { step: Step }) {
  const activeIndex = STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="checkout-steps" aria-label="Checkout progress">
      {STEPS.map((s, i) => {
        const state = i < activeIndex ? "done" : i === activeIndex ? "current" : "todo";
        return (
          <li key={s.key} className={`checkout-steps__item is-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="checkout-steps__num">{state === "done" ? "✓" : i + 1}</span>
            <span className="checkout-steps__label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function CheckoutClient({
  initialFulfillment = "pickup",
  offers = [],
}: {
  /** Resolved server-side from ?fulfillment= so the first render is already correct. */
  initialFulfillment?: Fulfillment;
  /** Clover discounts the merchant published as self-servable. */
  offers?: PublicOffer[];
}) {
  const { items, subtotal, count, clear, hydrated } = useCart();
  const formId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dial, setDial] = useState(DEFAULT_DIAL_CODE);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [fulfillment, setFulfillment] = useState<Fulfillment>(initialFulfillment);
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState<string | undefined>(undefined);
  const [addressCheck, setAddressCheck] = useState<AddressCheck | null>(null);
  const [addressChecking, setAddressChecking] = useState(false);
  const [deliveryTypeKey, setDeliveryTypeKey] = useState<string | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [minScheduledFor] = useState(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
  const [stepState, setStep] = useState<Step>("review");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [tokenize, setTokenize] = useState<(() => Promise<string>) | null>(null);
  const [paidTotal, setPaidTotal] = useState<number | null>(null);
  const [discounts, setDiscounts] = useState<DiscountSelection>({ offerPublicIds: [] });
  // Delivery choice feeds the quote so the bag shows the same total the card
  // will be charged; the server reads the percentage, we only send the key.
  const quote = useCartQuote(items, !session, discounts, fulfillment === "delivery" ? deliveryTypeKey : null);
  /** Best total we can name right now: Clover's, else the tax forecast, else bare subtotal. */
  const runningTotal = session?.total ?? quote?.total ?? subtotal;

  async function checkAddress() {
    if (!address.trim()) return;
    setAddressChecking(true);
    setAddressCheck(null);
    setDeliveryTypeKey(null);
    setScheduledFor("");
    try {
      const res = await fetch("/api/delivery/check-address", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: address.trim(), ...(placeId ? { placeId } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as AddressCheck | null;
      setAddressCheck(data ?? { resolved: false, error: true });
    } catch {
      setAddressCheck({ resolved: false, error: true });
    } finally {
      setAddressChecking(false);
    }
  }

  const selectedType = addressCheck?.resolved
    ? addressCheck.types.find((t) => t.key === deliveryTypeKey)
    : undefined;

  const onCardReady = useCallback((fn: () => Promise<string>) => {
    setTokenize(() => fn);
  }, []);

  // An emptied cart with no checkout session can't be paid for — fall back to review.
  // Derived rather than corrected in an effect, so there is no render showing "pay"
  // for a cart that has nothing in it.
  const step = stepState === "pay" && items.length === 0 && !session ? "review" : stepState;

  /** Inline per-field validation. The server re-validates all of this — this pass
   *  exists so the customer sees which field is wrong, next to that field. */
  function validate(): Partial<Record<FieldKey, string>> {
    const errs: Partial<Record<FieldKey, string>> = {};
    if (!name.trim()) errs.name = "Tell us who's picking up.";
    if (!email.trim()) errs.email = "We email your receipt here.";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) errs.email = "That email looks incomplete.";
    const digits = phone.replace(/[^\d]/g, "");
    if (!digits) errs.phone = "Phone is required for order updates.";
    else if (digits.length < 7) errs.phone = "That number is too short.";
    if (fulfillment === "delivery") {
      if (!addressCheck?.resolved || addressCheck.types.length === 0) {
        errs.address = "Check your delivery address first.";
      } else if (!selectedType) {
        errs.deliveryType = "Choose a delivery type.";
      } else if (selectedType.requiresSchedule && !scheduledFor) {
        errs.scheduledFor = "Pick a delivery time.";
      }
    }
    return errs;
  }

  async function startCheckout() {
    setError(null);
    const errs = validate();
    setFieldErrors(errs);
    const firstBad = (
      ["name", "email", "phone", "address", "deliveryType", "scheduledFor"] as FieldKey[]
    ).find((k) => errs[k]);
    if (firstBad) {
      // useId() values contain ':' so they are not valid CSS selectors — look the
      // field up by id directly rather than through querySelector.
      document.getElementById(`${formId}-${firstBad}`)?.focus();
      return;
    }
    if (items.length === 0) {
      setError("Add at least one item from the menu");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productPublicId: i.productPublicId,
            quantity: i.quantity,
            // Ids only — the server re-reads every modifier price.
            modifiers: i.modifiers.map((m) => m.cloverModifierId),
          })),
          contact: {
            name: name.trim(),
            email: email.trim(),
            phone: joinPhone(dial, phone),
            note: note.trim() || null,
          },
          // Ids and a typed code only — the server re-derives every amount from
          // the synced Clover discounts.
          discounts: { offerPublicIds: discounts.offerPublicIds, code: discounts.code ?? null },
          fulfillment:
            fulfillment === "delivery" && deliveryTypeKey
              ? {
                  type: "delivery",
                  deliveryTypeKey,
                  address: address.trim(),
                  ...(placeId ? { placeId } : {}),
                  ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}),
                }
              : { type: "pickup" },
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (CheckoutSession & { detail?: string })
        | null;
      if (!res.ok) {
        setError(data?.detail ?? "Could not create order");
        return;
      }
      setSession(data as CheckoutSession);
      setStep("pay");
    } catch {
      setError("Could not create order");
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!session || !tokenize) {
      setError("Payment form is still loading");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const source = await tokenize();
      const res = await fetch("/api/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderPublicId: session.orderPublicId,
          source,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        detail?: string;
        total?: number;
      } | null;
      if (!res.ok) {
        setError(data?.detail ?? "Payment failed");
        return;
      }
      setPaidTotal(data?.total ?? session.total);
      clear();
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="checkout-layout" aria-busy="true">
        <div className="card card--cream checkout-skeleton" />
        <div className="card checkout-skeleton" style={{ background: "var(--white)" }} />
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="card card--green surface-green checkout-done" style={{ color: "#fff", padding: 28 }}>
        <Pill variant="yellow">PAID</Pill>
        <h2 className="display" style={{ fontSize: "clamp(1.8rem,4vw,2.4rem)", margin: "12px 0" }}>
          Order locked in
        </h2>
        <p style={{ fontWeight: 500, maxWidth: 440 }}>
          Thanks{name ? `, ${name}` : ""} — we charged {money(paidTotal ?? 0)} and sent the order to
          the kitchen POS.{" "}
          {session?.fulfillment === "delivery_instant"
            ? "On its way to you shortly — instant delivery, usually within 45 min."
            : session?.fulfillment === "delivery_scheduled" && session.scheduledFor
              ? `Scheduled for delivery ${new Date(session.scheduledFor).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" })}.`
              : "Ready in about 15 minutes at 3315 Danforth Ave."}
        </p>
        {session ? (
          <p className="checkout-orderid" style={{ marginTop: 14 }}>
            Order {session.orderPublicId}
          </p>
        ) : null}
        <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {session ? (
            <Btn href={`/track/${session.orderPublicId}`} variant="ink">
              Track this order
            </Btn>
          ) : null}
          <Btn page="eats" variant="yellow">
            Back to menu
          </Btn>
          <Btn
            variant="cream"
            onClick={() => {
              setStep("review");
              setSession(null);
              setPaidTotal(null);
              setError(null);
              setFieldErrors({});
            }}
          >
            Start another order
          </Btn>
        </div>
      </div>
    );
  }

  const bag = (
    <>
      <div className="checkout-aside__head">
        <h2 className="display">Your bag</h2>
        <strong>{money(runningTotal)}</strong>
      </div>
      {items.length === 0 && !session ? (
        <div>
          <p style={{ fontWeight: 600, marginBottom: 16 }}>
            Cart is empty. Add in-stock items from the menu first.
          </p>
          <Btn page="eats" variant="green">
            Browse menu →
          </Btn>
        </div>
      ) : (
        <>
          <CartLines items={items} compact />
          <OrderSummary
            subtotal={session?.subtotal ?? quote?.subtotal ?? subtotal}
            tax={session?.tax ?? quote?.tax}
            total={session?.total ?? quote?.total}
            discountAmount={session?.discountAmount ?? quote?.discountAmount}
            discountLines={session ? undefined : quote?.discountLines}
            taxLines={session ? undefined : quote?.taxLines}
            stage={session ? "final" : quote ? "quoted" : "estimate"}
          />
        </>
      )}
    </>
  );

  return (
    <div className="checkout-layout">
      <div className="checkout-main">
        <StepTrack step={step} />

        {/* Mobile: the bag collapses so the form is the first thing in reach.
            Desktop gets the always-open <aside> below instead. */}
        <details className="card card--cream checkout-bag-mobile">
          <summary>
            <span>
              {count} item{count === 1 ? "" : "s"} in your bag
            </span>
            <strong>{money(runningTotal)}</strong>
          </summary>
          <div className="checkout-bag-mobile__body">{bag}</div>
        </details>

        {step === "review" ? (
          <form
            className="card checkout-panel"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void startCheckout();
            }}
          >
            <h2 className="display checkout-panel__title">How are you getting it?</h2>

            <div className="checkout-fulfillment" role="radiogroup" aria-label="Fulfillment">
              {(
                [
                  ["pickup", "Pickup", "3315 Danforth Ave · ~15 min"],
                  ["delivery", "Delivery", "Enter your address to see what's available"],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={fulfillment === value}
                  className={`checkout-choice ${fulfillment === value ? "is-active" : ""}`}
                  onClick={() => setFulfillment(value)}
                >
                  <span className="checkout-choice__label">{label}</span>
                  <span className="checkout-choice__hint">{hint}</span>
                </button>
              ))}
            </div>

            {fulfillment === "delivery" ? (
              <div className={`field checkout-field ${fieldErrors.address ? "field--err" : ""}`}>
                <label htmlFor={`${formId}-address`}>Delivery address *</label>
                <AddressAutocomplete
                  id={`${formId}-address`}
                  className="input"
                  value={address}
                  onChange={(v) => {
                    setAddress(v);
                    setPlaceId(undefined);
                    setAddressCheck(null);
                    setDeliveryTypeKey(null);
                  }}
                  onPick={({ address: a, placeId: p }) => {
                    setAddress(a);
                    setPlaceId(p);
                  }}
                />
                <div className="checkout-address__actions">
                  <Btn
                    variant="cream"
                    size="sm"
                    disabled={!address.trim() || addressChecking}
                    onClick={() => void checkAddress()}
                  >
                    {addressChecking ? "Checking…" : "Check address"}
                  </Btn>
                  {addressCheck?.resolved === true && addressCheck.types.length > 0 ? (
                    <p className="checkout-address__ok">
                      ✓ {addressCheck.distanceKm}km away — {addressCheck.types.length} delivery
                      option{addressCheck.types.length === 1 ? "" : "s"} available below.
                    </p>
                  ) : addressCheck?.resolved === true ? (
                    <p className="checkout-address__ok">
                      {addressCheck.distanceKm}km away
                      {addressCheck.limitKm != null ? ` — outside our ${addressCheck.limitKm}km delivery range.` : " — outside our delivery range."}{" "}
                      Try pickup instead.
                    </p>
                  ) : addressCheck?.resolved === false ? (
                    <p className="err-msg" role="alert">
                      {addressCheck.error
                        ? "Couldn't check that address — try again."
                        : "Couldn't find that address — double check it."}
                    </p>
                  ) : null}
                </div>
                {fieldErrors.address ? (
                  <span className="err-msg" role="alert">
                    {fieldErrors.address}
                  </span>
                ) : null}
                {addressCheck?.resolved === true ? (
                  <div className="card" style={{ marginTop: 10, padding: 0, overflow: "hidden" }}>
                    <StaticMap
                      center={{
                        lat: (DEFAULT_STORE_LAT + addressCheck.lat) / 2,
                        lng: (DEFAULT_STORE_LNG + addressCheck.lng) / 2,
                      }}
                      markers={[
                        { lat: DEFAULT_STORE_LAT, lng: DEFAULT_STORE_LNG, color: "#111", title: "Puchkaman" },
                        { lat: addressCheck.lat, lng: addressCheck.lng, color: "var(--green)", title: "Your address" },
                      ]}
                      zoom={12}
                      heightPx={220}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {fulfillment === "delivery" && addressCheck?.resolved === true && addressCheck.types.length > 0 ? (
              <div className="field checkout-field">
                <label id={`${formId}-deliveryType-label`}>Delivery type *</label>
                <DeliveryTypePicker
                  types={addressCheck.types}
                  subtotal={subtotal}
                  value={deliveryTypeKey}
                  onChange={(key) => {
                    setDeliveryTypeKey(key);
                    if (!addressCheck.types.find((t) => t.key === key)?.requiresSchedule) {
                      setScheduledFor("");
                    }
                  }}
                />
                {fieldErrors.deliveryType ? (
                  <span className="err-msg" role="alert">
                    {fieldErrors.deliveryType}
                  </span>
                ) : null}
              </div>
            ) : null}

            {selectedType?.requiresSchedule ? (
              <div className={`field checkout-field ${fieldErrors.scheduledFor ? "field--err" : ""}`}>
                <label htmlFor={`${formId}-scheduledFor`}>Delivery time *</label>
                <input
                  id={`${formId}-scheduledFor`}
                  type="datetime-local"
                  className="input"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  min={minScheduledFor}
                  aria-invalid={fieldErrors.scheduledFor ? true : undefined}
                />
                {fieldErrors.scheduledFor ? (
                  <span className="err-msg" role="alert">
                    {fieldErrors.scheduledFor}
                  </span>
                ) : null}
              </div>
            ) : null}

            <h2 className="display checkout-panel__title">Who&apos;s it for?</h2>
            <div className="checkout-fields">
              <div className={`field checkout-field ${fieldErrors.name ? "field--err" : ""}`}>
                <label htmlFor={`${formId}-name`}>Name *</label>
                <input
                  id={`${formId}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  autoComplete="name"
                  aria-invalid={fieldErrors.name ? true : undefined}
                  required
                />
                {fieldErrors.name ? (
                  <span className="err-msg" role="alert">
                    {fieldErrors.name}
                  </span>
                ) : null}
              </div>
              <div className={`field checkout-field ${fieldErrors.email ? "field--err" : ""}`}>
                <label htmlFor={`${formId}-email`}>Email *</label>
                <input
                  id={`${formId}-email`}
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  autoComplete="email"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  required
                />
                {fieldErrors.email ? (
                  <span className="err-msg" role="alert">
                    {fieldErrors.email}
                  </span>
                ) : (
                  <span className="checkout-hint">Your receipt lands here.</span>
                )}
              </div>
              <PhoneField
                id={`${formId}-phone`}
                dial={dial}
                national={phone}
                onDialChange={setDial}
                onNationalChange={setPhone}
                error={fieldErrors.phone}
              />
              <div className="field checkout-field">
                <label htmlFor={`${formId}-note`}>Note for kitchen</label>
                <input
                  id={`${formId}-note`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="input"
                  maxLength={500}
                  placeholder="Extra spicy, no coriander…"
                />
              </div>
            </div>

            <h2 className="display checkout-panel__title">Offers &amp; codes</h2>
            <DiscountPicker
              offers={offers}
              value={discounts}
              onChange={setDiscounts}
              applied={quote?.discountLines.map((d) => d.name) ?? []}
              invalidCode={quote?.invalidCode ?? false}
            />

            {error ? (
              <p className="checkout-error" role="alert" aria-live="assertive">
                {error}
              </p>
            ) : null}

            <Btn
              variant="green"
              size="lg"
              block
              type="submit"
              disabled={busy || items.length === 0}
              className="checkout-submit"
            >
              {busy ? "Pricing your order…" : `Continue to payment · ${money(runningTotal)}`}
            </Btn>
            <p className="checkout-hint checkout-hint--center">
              Nothing is charged until you enter a card on the next step.
            </p>
          </form>
        ) : session ? (
          <div className="card checkout-panel">
            <div className="checkout-panel__head">
              <h2 className="display checkout-panel__title" style={{ margin: 0 }}>
                Pay with card
              </h2>
              <Pill variant="green">Secure checkout</Pill>
            </div>
            <p className="checkout-hint">
              Order {session.orderPublicId}
              {session.environment === "sandbox" ? " · sandbox" : ""}. Card details go straight to
              our payment processor — this site never sees them.
            </p>

            <CloverCardForm
              pakmsKey={session.pakmsKey}
              sdkUrl={session.checkoutSdkUrl}
              onReady={onCardReady}
            />

            {error ? (
              <p className="checkout-error" role="alert" aria-live="assertive">
                {error}
              </p>
            ) : null}

            <div className="checkout-pay-actions">
              <Btn
                variant="green"
                size="lg"
                block
                disabled={busy || !tokenize}
                onClick={() => void pay()}
                className="checkout-submit"
              >
                {busy ? "Processing…" : !tokenize ? "Loading card form…" : `Pay ${money(session.total)}`}
              </Btn>
              <Btn
                variant="cream"
                onClick={() => {
                  setStep("review");
                  setSession(null);
                  setTokenize(null);
                  setError(null);
                }}
              >
                ← Back to details
              </Btn>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="card card--cream checkout-aside">{bag}</aside>
    </div>
  );
}
