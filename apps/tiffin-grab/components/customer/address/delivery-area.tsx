"use client";
import { useEffect, useState } from "react";
import { validatePostal } from "@/app/(public)/subscribe/actions";

// Zones match on the area (FSA, e.g. M4N), so an area alone is enough — a picked intersection
// only resolves that far.
const CHECKABLE = /^[A-Z]\d[A-Z](\d[A-Z]\d)?$/;

export type DeliveryArea = { code: string; served: boolean; zone: string | null; slotWindow: string | null };

/**
 * Looks the postal code up against our delivery zones as soon as its area (first three
 * characters) or the whole code is known — typed, or filled in by picking an address
 * suggestion. Null until then.
 */
export function useDeliveryArea(postalCode: string | null | undefined): DeliveryArea | null {
  const code = (postalCode ?? "").replace(/\s+/g, "").toUpperCase();
  const [area, setArea] = useState<DeliveryArea | null>(null);
  useEffect(() => {
    if (!CHECKABLE.test(code)) return;
    let live = true;
    validatePostal(code)
      .then((r) => live && setArea({ code, served: r.served, zone: r.zone?.name ?? null, slotWindow: r.zone?.slotWindow ?? null }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [code]);
  return area?.code === code ? area : null;
}

/** "We deliver here" / "Not in our area yet" under an address form. */
export function DeliveryAreaNote({ area }: { area: DeliveryArea | null }) {
  if (!area) return null;
  // Zones match on the area, but an order needs the whole code: say so before the server does.
  if (area.served && area.code.length === 3) {
    return (
      <p role="status" className="text-destructive text-[13px] font-medium">
        We deliver to {area.code}. Now enter your full postal code, like M5V 2T6.
      </p>
    );
  }
  return area.served ? (
    <p role="status" className="text-[13px] font-medium text-[var(--success,#1F7A4D)]">
      We deliver here{area.zone ? ` — ${area.zone}` : ""}.
    </p>
  ) : (
    <p role="status" className="text-destructive text-[13px] font-medium">
      We don&apos;t deliver to {`${area.code.slice(0, 3)} ${area.code.slice(3)}`.trim()} yet.
    </p>
  );
}
