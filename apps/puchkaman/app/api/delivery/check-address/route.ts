import { z } from "zod";
import { handler, json, problem } from "@realm/routes";
import { haversineKm } from "@/lib/delivery/distance";
import { resolveAddress } from "@/lib/delivery/resolve-address";
import { availableTypes, deliveryLimitKm } from "@/lib/delivery/zones";
import { getStoreOrigin, getZonesWithTypes } from "@/lib/delivery/zones.service";
import { clientIp } from "@/lib/http/client-ip";
import { isRateLimited } from "@/lib/http/rate-limit";

const checkAddressSchema = z.object({
  address: z.string().trim().min(5),
  placeId: z.string().trim().min(1).optional(),
});

// This route calls Places Details/Text Search per request against
// GOOGLE_PLACES_API_KEY — the same key @realm/google-reviews uses for the
// marketing site. It's public and unauthenticated, so throttle per IP to
// keep an unattended loop from running up billing / starving reviews.
const CHECK_ADDRESS_LIMIT = 20;
const CHECK_ADDRESS_WINDOW_MS = 60_000;

// Public (unauthenticated) — lets checkout and the public "do we deliver to
// you?" checker ask what delivery types an address qualifies for before the
// customer commits. This is advisory only: createCheckout() re-derives the
// zone/type/distance server-side from a fresh geocode, never trusting this.
export const POST = handler(async (request: Request): Promise<Response> => {
  // Never skip the check for a missing IP (fail-open) — traffic without
  // x-real-ip (proxy misconfiguration, or anything bypassing Caddy) is
  // bucketed under one sentinel key so it's still throttled collectively,
  // without hard-blocking any single real customer on a header hiccup.
  const ip = clientIp(request) ?? "unknown";
  if (isRateLimited(ip, CHECK_ADDRESS_LIMIT, CHECK_ADDRESS_WINDOW_MS)) {
    return problem(429, "Too many address checks — try again in a minute.");
  }

  const parsed = checkAddressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");

  const resolved = await resolveAddress(parsed.data);
  if (!resolved) return json({ resolved: false });

  const [zones, origin] = await Promise.all([getZonesWithTypes(), getStoreOrigin()]);
  const distanceKm = Number(
    haversineKm(origin.lat, origin.lng, resolved.lat, resolved.lng).toFixed(2),
  );

  return json({
    resolved: true,
    formattedAddress: resolved.formattedAddress,
    // Resolved coordinates, so checkout can show the customer where their
    // address landed on the map.
    lat: resolved.lat,
    lng: resolved.lng,
    distanceKm,
    limitKm: deliveryLimitKm(zones),
    types: availableTypes(distanceKm, zones),
  });
});
