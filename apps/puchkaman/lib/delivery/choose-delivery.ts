import { availableTypes, deliveryLimitKm, zoneForType, type DeliveryType, type Zone, type ZoneWithTypes } from "./zones";

export type DeliveryChoice =
  | { ok: true; type: DeliveryType; zone: Zone }
  | {
      ok: false;
      reason: "out-of-range" | "not-offered" | "below-minimum" | "needs-schedule";
      message: string;
    };

/**
 * The eligibility-and-rules decision for a delivery checkout, pulled out of
 * orders.service.ts so the exploit this exists to close — a type key valid
 * at a short distance being accepted at a longer one — is directly testable
 * without mocking the database.
 */
export function chooseDelivery(input: {
  distanceKm: number;
  typeKey: string;
  zones: ZoneWithTypes[];
  subtotal: number;
  scheduledFor?: string;
}): DeliveryChoice {
  const { distanceKm, typeKey, zones, subtotal, scheduledFor } = input;

  const offered = availableTypes(distanceKm, zones);
  const type = offered.find((t) => t.key === typeKey);
  if (!type) {
    const limit = deliveryLimitKm(zones);
    return {
      ok: false,
      reason: "not-offered",
      message:
        limit == null
          ? "Delivery is unavailable right now — pickup is available."
          : offered.length === 0
            ? `We don't deliver that far yet (${distanceKm} km — we deliver up to ${limit} km). Pickup is available.`
            : "That delivery option isn't available for this address.",
    };
  }

  if (subtotal < type.minSubtotal) {
    return {
      ok: false,
      reason: "below-minimum",
      message: `${type.label} requires an order over $${type.minSubtotal}.`,
    };
  }

  if (type.requiresSchedule && !scheduledFor) {
    return {
      ok: false,
      reason: "needs-schedule",
      message: `Pick a delivery time for ${type.label}.`,
    };
  }

  const zone = zoneForType(distanceKm, type.key, zones);
  if (!zone) {
    return {
      ok: false,
      reason: "out-of-range",
      message: "Could not resolve a delivery zone for that address.",
    };
  }

  return { ok: true, type, zone };
}
