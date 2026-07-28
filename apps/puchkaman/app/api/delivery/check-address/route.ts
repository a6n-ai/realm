import { z } from "zod";
import { handler, json, problem } from "@realm/routes";
import { geocodeAddress } from "@/lib/delivery/geocode";
import {
  distanceFromStoreKm,
  INSTANT_DELIVERY_RADIUS_KM,
  SCHEDULED_DELIVERY_MIN_SUBTOTAL,
} from "@/lib/delivery/distance";

const checkAddressSchema = z.object({ address: z.string().trim().min(5) });

// Public (unauthenticated) — lets the checkout form give instant feedback on
// whether an address is in the instant-delivery radius before the customer
// fills out the rest of checkout. This is advisory only: createCheckout()
// re-derives the tier server-side from a fresh geocode, never trusting this.
export const POST = handler(async (request: Request): Promise<Response> => {
  const parsed = checkAddressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");

  const point = await geocodeAddress(parsed.data.address);
  if (!point) {
    return json({ eligible: false, reason: "Couldn't find that address — try adding city and postal code." });
  }

  const distanceKm = distanceFromStoreKm(point.lat, point.lng);
  const tier = distanceKm <= INSTANT_DELIVERY_RADIUS_KM ? "instant" : "scheduled";

  return json({
    eligible: true,
    tier,
    distanceKm: Math.round(distanceKm * 10) / 10,
    ...(tier === "scheduled" ? { minSubtotal: SCHEDULED_DELIVERY_MIN_SUBTOTAL } : {}),
  });
});
