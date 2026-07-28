"use client";

import { useState } from "react";
import { Btn } from "@/components/brutal/shared";
import { distanceFromStoreKm, INSTANT_DELIVERY_RADIUS_KM, SCHEDULED_DELIVERY_MIN_SUBTOTAL } from "@/lib/delivery/distance";

type Result =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "instant"; distanceKm: number }
  | { status: "scheduled"; distanceKm: number }
  | { status: "error"; message: string };

// Quick client-side preview using the browser's own location — checkout still
// re-derives the real tier server-side from a typed address (GPS coords alone
// aren't a deliverable address, and the client is never trusted for pricing).
export function OrderDirectCta() {
  const [result, setResult] = useState<Result>({ status: "idle" });

  function checkLocation() {
    if (!("geolocation" in navigator)) {
      setResult({ status: "error", message: "Location isn't available on this device — no problem, enter your address at checkout." });
      return;
    }
    setResult({ status: "checking" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const distanceKm = Math.round(distanceFromStoreKm(pos.coords.latitude, pos.coords.longitude) * 10) / 10;
        setResult(
          distanceKm <= INSTANT_DELIVERY_RADIUS_KM
            ? { status: "instant", distanceKm }
            : { status: "scheduled", distanceKm },
        );
      },
      () => {
        setResult({ status: "error", message: "Couldn't get your location — no problem, enter your address at checkout." });
      },
      { timeout: 10000 },
    );
  }

  if (result.status === "idle") {
    return (
      <Btn variant="yellow" block onClick={checkLocation}>
        Order Direct →
      </Btn>
    );
  }

  if (result.status === "checking") {
    return (
      <Btn variant="yellow" block disabled>
        Checking your location…
      </Btn>
    );
  }

  if (result.status === "instant") {
    return (
      <div>
        <p style={{ fontWeight: 700, marginBottom: 10, fontSize: "0.88rem" }}>
          ✓ You&apos;re {result.distanceKm}km away — instant delivery, 15% off!
        </p>
        <Btn href="/checkout?fulfillment=delivery" variant="yellow" block>
          Continue to Checkout →
        </Btn>
      </div>
    );
  }

  if (result.status === "scheduled") {
    return (
      <div>
        <p style={{ fontWeight: 700, marginBottom: 10, fontSize: "0.88rem" }}>
          You&apos;re {result.distanceKm}km away — outside our {INSTANT_DELIVERY_RADIUS_KM}km instant
          zone. Scheduled delivery is available (${SCHEDULED_DELIVERY_MIN_SUBTOTAL} minimum).
        </p>
        <Btn href="/checkout?fulfillment=delivery" variant="yellow" block>
          Schedule Delivery →
        </Btn>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontWeight: 700, marginBottom: 10, fontSize: "0.82rem" }}>{result.message}</p>
      <Btn href="/checkout?fulfillment=delivery" variant="yellow" block>
        Continue to Checkout →
      </Btn>
    </div>
  );
}
