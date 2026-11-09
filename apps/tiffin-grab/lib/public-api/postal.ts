import { findZone } from "@/lib/catalog/zone-match";
import { parseWindow } from "@/lib/landing/areas";

export const POSTAL_HINT = "postal must be a Canadian postal code or its first three characters, like M5V 2T6";

export { normalizePostal } from "@/lib/catalog/postal";

type Zone = { name: string; active: boolean; postalPrefixes: string[]; radiusKm: number | null; slotWindow: string | null };

export const windowOf = (slot: string | null) => {
  const w = parseWindow(slot);
  return w ? { from: w.from, to: w.to } : null;
};

/** Checkout's postal zone match. Never geocodes (the API is unauthenticated, a geocode is a paid call), so a radius-only area reads as not served here; checkout still decides. */
export async function deliveryCheck<Z extends Zone>(zones: Z[], postal: string, orgId?: string | null) {
  const z = await findZone(zones.filter((x) => x.active), { postalCode: postal }, orgId, { geocode: false });
  return { postal, served: !!z, area: z?.name ?? null, window: z ? (windowOf(z.slotWindow) ?? z.slotWindow) : null };
}
