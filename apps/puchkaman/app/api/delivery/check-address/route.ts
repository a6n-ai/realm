import { z } from "zod";
import { handler, json, problem } from "@realm/routes";
import { haversineKm } from "@/lib/delivery/distance";
import { resolveAddress } from "@/lib/delivery/resolve-address";
import { availableTypes, deliveryLimitKm } from "@/lib/delivery/zones";
import { getStoreOrigin, getZonesWithTypes } from "@/lib/delivery/zones.service";

const checkAddressSchema = z.object({
  address: z.string().trim().min(5),
  placeId: z.string().trim().min(1).optional(),
});

// Public (unauthenticated) — lets checkout and the public "do we deliver to
// you?" checker ask what delivery types an address qualifies for before the
// customer commits. This is advisory only: createCheckout() re-derives the
// zone/type/distance server-side from a fresh geocode, never trusting this.
export const POST = handler(async (request: Request): Promise<Response> => {
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
    distanceKm,
    limitKm: deliveryLimitKm(zones),
    types: availableTypes(distanceKm, zones),
  });
});
