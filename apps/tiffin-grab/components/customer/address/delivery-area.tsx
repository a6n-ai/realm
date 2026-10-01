"use client";
import { useEffect, useState } from "react";
import { validatePostal } from "@/app/(public)/subscribe/actions";
import { isFullPostalCode } from "@/lib/catalog/postal";

export type DeliveryArea = { code: string; served: boolean; zone: string | null; slotWindow: string | null };

/**
 * Looks the postal code up against our delivery zones once the whole code is known — typed,
 * or filled in by picking an address suggestion. Null until then: the area (first three
 * characters) is only how zones match, and an order needs the full code.
 */
export function useDeliveryArea(postalCode: string | null | undefined): DeliveryArea | null {
  const code = (postalCode ?? "").replace(/\s+/g, "").toUpperCase();
  const [area, setArea] = useState<DeliveryArea | null>(null);
  useEffect(() => {
    if (!isFullPostalCode(code)) return;
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
