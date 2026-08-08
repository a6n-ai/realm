"use client";

import { useState } from "react";
import { Btn } from "@/components/brutal/shared";
import { AddressAutocomplete } from "@/components/order/address-autocomplete";
import { money } from "@/lib/cart/types";
import type { CheckoutDeliveryType } from "@/components/order/delivery-type-picker";

type CheckResult =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "served"; formattedAddress: string; distanceKm: number; types: CheckoutDeliveryType[] }
  | { status: "too-far"; formattedAddress: string; distanceKm: number; limitKm: number | null }
  | { status: "not-found" }
  | { status: "error" };

/** Public "do we deliver to you?" checker — same endpoint checkout uses, no
 *  cart/subtotal context here, so it just lists what an address qualifies
 *  for rather than picking one. */
export function DeliveryChecker() {
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<CheckResult>({ status: "idle" });

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

  return (
    <div>
      <div className="checkout-address__actions" style={{ marginBottom: 10 }}>
        <AddressAutocomplete
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
          className="input"
        />
      </div>
      <Btn
        variant="yellow"
        block
        disabled={!address.trim() || result.status === "checking"}
        onClick={() => void check()}
      >
        {result.status === "checking" ? "Checking…" : "Check my address →"}
      </Btn>

      {result.status === "served" ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontWeight: 700, marginBottom: 8, fontSize: "0.88rem" }}>
            ✓ We deliver to {result.formattedAddress} — {result.distanceKm}km away.
          </p>
          <ul style={{ display: "grid", gap: 6, listStyle: "none", padding: 0, margin: "0 0 10px" }}>
            {result.types.map((t) => (
              <li key={t.key} style={{ fontSize: "0.84rem", fontWeight: 600 }}>
                {t.label}
                {t.discountPct > 0 ? ` · ${Math.round(t.discountPct)}% off` : ""}
                {t.minSubtotal > 0 ? ` · ${money(t.minSubtotal)} minimum` : ""}
                {t.requiresSchedule ? " · pick a time" : ""}
              </li>
            ))}
          </ul>
          <Btn href="/checkout?fulfillment=delivery" variant="yellow" block>
            Continue to Checkout →
          </Btn>
        </div>
      ) : result.status === "too-far" ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontWeight: 700, marginBottom: 10, fontSize: "0.84rem" }}>
            {result.formattedAddress} is {result.distanceKm}km away
            {result.limitKm != null ? ` — outside our ${result.limitKm}km delivery range.` : " — outside our delivery range."}{" "}
            Pickup at 3315 Danforth Ave is still ~15 min.
          </p>
          <Btn page="eats" variant="cream" block>
            Order for pickup instead →
          </Btn>
        </div>
      ) : result.status === "not-found" ? (
        <p style={{ fontWeight: 700, marginTop: 10, fontSize: "0.84rem" }}>
          Couldn&apos;t find that address — double check it, or enter it again at checkout.
        </p>
      ) : result.status === "error" ? (
        <p style={{ fontWeight: 700, marginTop: 10, fontSize: "0.84rem" }}>
          Couldn&apos;t check that address — try again.
        </p>
      ) : null}
    </div>
  );
}
