"use client";

import { useId, useState } from "react";
import { Btn } from "@/components/brutal/shared";
import { AddressAutocomplete } from "@/components/order/address-autocomplete";
import { useCart } from "@/components/cart/cart-provider";
import { money } from "@/lib/cart/types";
import type { CheckoutDeliveryType } from "@/components/order/delivery-type-picker";

type CheckResult =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "served";
      formattedAddress: string;
      distanceKm: number;
      types: CheckoutDeliveryType[];
      unavailableTypeLabels: string[];
    }
  | { status: "too-far"; formattedAddress: string; distanceKm: number; limitKm: number | null }
  | { status: "not-found" }
  | { status: "error" };

/** Public "do we deliver to you?" checker — same endpoint checkout uses, no
 *  cart/subtotal context here, so it just lists what an address qualifies
 *  for rather than picking one. */
export function DeliveryChecker() {
  const { count, hydrated } = useCart();
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<CheckResult>({ status: "idle" });
  const fieldId = `${useId()}-delivery-address`;

  async function check() {
    if (!address.trim()) return;
    setResult({ status: "checking" });
    try {
      const res = await fetch("/api/delivery/check-address", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: address.trim(), ...(placeId ? { placeId } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as
        | { resolved: false }
        | {
            resolved: true;
            formattedAddress: string;
            distanceKm: number;
            limitKm: number | null;
            types: CheckoutDeliveryType[];
            unavailableTypeLabels: string[];
          }
        | null;
      if (!data) {
        setResult({ status: "error" });
      } else if (!data.resolved) {
        setResult({ status: "not-found" });
      } else if (data.types.length > 0) {
        setResult({
          status: "served",
          formattedAddress: data.formattedAddress,
          distanceKm: data.distanceKm,
          types: data.types,
          unavailableTypeLabels: data.unavailableTypeLabels,
        });
      } else {
        setResult({
          status: "too-far",
          formattedAddress: data.formattedAddress,
          distanceKm: data.distanceKm,
          limitKm: data.limitKm,
        });
      }
    } catch {
      setResult({ status: "error" });
    }
  }

  // An empty bag has nothing to check out, so a qualified address sends the
  // customer to the menu — linking straight to checkout dead-ended on "Cart is
  // empty. Add in-stock items from the menu first."
  const hasItems = hydrated && count > 0;

  return (
    <div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label htmlFor={fieldId}>Your delivery address</label>
        <AddressAutocomplete
          id={fieldId}
          value={address}
          onChange={(v) => {
            setAddress(v);
            setPlaceId(undefined);
            setResult({ status: "idle" });
          }}
          onPick={({ address: a, placeId: p }) => {
            setAddress(a);
            setPlaceId(p);
          }}
        />
      </div>
      <Btn
        variant="green"
        block
        disabled={!address.trim() || result.status === "checking"}
        onClick={() => void check()}
      >
        {result.status === "checking" ? "Checking…" : "Check my address →"}
      </Btn>

      {result.status === "served" ? (
        <div className="delivery-check__out">
          <p className="delivery-check__ok">
            ✓ We deliver to {result.formattedAddress} — {result.distanceKm}km away.
          </p>
          <ul className="delivery-check__types">
            {result.types.map((t) => (
              <li key={t.key}>
                <strong>{t.label}</strong>
                {t.discountPct > 0 ? ` · ${Math.round(t.discountPct)}% off` : ""}
                {t.minSubtotal > 0 ? ` · ${money(t.minSubtotal)} minimum` : ""}
                {t.requiresSchedule ? " · you pick a time slot" : ""}
              </li>
            ))}
          </ul>
          {result.unavailableTypeLabels.length > 0 ? (
            <p className="delivery-check__hint">
              {result.unavailableTypeLabels.join(", ")} isn&apos;t available this far.
            </p>
          ) : null}
          {hasItems ? (
            <Btn href="/checkout?fulfillment=delivery" variant="ink" block>
              Continue to checkout →
            </Btn>
          ) : (
            <Btn page="eats" variant="ink" block>
              Pick your food →
            </Btn>
          )}
        </div>
      ) : result.status === "too-far" ? (
        <div className="delivery-check__out">
          <p className="delivery-check__ok">
            {result.formattedAddress} is {result.distanceKm}km away
            {result.limitKm != null
              ? ` — outside our ${result.limitKm}km delivery range.`
              : " — outside our delivery range."}{" "}
            Pickup at 3315 Danforth Ave is still ~15 min.
          </p>
          <Btn page="eats" variant="ink" block>
            Order for pickup instead →
          </Btn>
        </div>
      ) : result.status === "not-found" ? (
        <p className="delivery-check__ok" style={{ marginTop: 12 }}>
          Couldn&apos;t find that address — double check it, or enter it again at checkout.
        </p>
      ) : result.status === "error" ? (
        <p className="delivery-check__ok" style={{ marginTop: 12 }}>
          Couldn&apos;t check that address — try again.
        </p>
      ) : null}
    </div>
  );
}
