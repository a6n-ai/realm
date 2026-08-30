import { handler, json, problem } from "@realm/routes";
import { ValidationError } from "@realm/commons";
import { resolveAndPersist } from "@realm/places";
import {
  createCheckoutSchema,
  ordersService,
} from "@/lib/services/orders.service";

/** Create pending local order + Clover atomic order; return PAKMS key for iframe. */
export const POST = handler(async (request: Request): Promise<Response> => {
  const body = await request.json().catch(() => null);
  const parsed = createCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  // Coordinates are never taken from the request body — a client asserting its
  // own lat/lng could plant a point next to the shop. Re-resolve the same
  // placeId/address the client typed server-side (AWS-only, persist bucket)
  // and store only that result; a typed-but-unresolved address just gets null.
  //
  // This is a second geocode of the same address: ordersService.createCheckout
  // (lib/services/orders.service.ts) independently calls resolveAddress()
  // (lib/delivery/resolve-address.ts) to derive deliveryDistanceKm/zone/pricing,
  // via a Google-first-then-AWS advisory chain, persist: false. That chain has
  // to stay Google-first because the zone-boundary data it feeds was tuned
  // against Google's outputs elsewhere in the codebase. This route's call is
  // AWS-only because it's the one path allowed to persist a geocode (cost/legal
  // ruling — see resolveAndPersist's doc comment in @realm/places).
  // Two different provider chains for one address means the stored map point
  // and the priced distance can, in theory, disagree slightly. Accepted: the
  // two paths are already provider-independent by design, and unifying them
  // would mean threading a resolved point through createCheckout's internals —
  // out of scope here.
  const resolvedDelivery =
    parsed.data.fulfillment.type === "delivery"
      ? await resolveAndPersist({
          placeId: parsed.data.fulfillment.placeId,
          address: parsed.data.fulfillment.address,
        }).catch(() => null)
      : null;
  try {
    const result = await ordersService.createCheckout(
      parsed.data,
      resolvedDelivery ? { lat: resolvedDelivery.lat, lng: resolvedDelivery.lng } : null,
    );
    return json(result);
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    const msg = e instanceof Error ? e.message : "Checkout failed";
    return problem(500, msg);
  }
});
