import { findZone } from "@/lib/catalog/zone-match";
import { isFullPostalCode, isPostalFsa } from "@/lib/catalog/postal";
import { parseWindow } from "@/lib/landing/areas";

export const POSTAL_HINT = "postal must be a Canadian postal code or its first three characters, like M5V 2T6";

/** "m5v 2t6" -> "M5V2T6"; null unless it is a Canadian FSA (M5V) or a full postal code. */
export function normalizePostal(raw: string | null | undefined): string | null {
  const p = (raw ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (p.length === 3) return isPostalFsa(p) ? p : null;
  return p.length === 6 && isFullPostalCode(p) ? p : null;
}

type Zone = { name: string; active: boolean; postalPrefixes: string[]; radiusKm: number | null; slotWindow: string | null };

export const windowOf = (slot: string | null) => {
  const w = parseWindow(slot);
  return w ? { from: w.from, to: w.to } : null;
};

/** Same zone match checkout uses (postal prefix, then radius circles), so this answer agrees with what an order gets. */
export async function deliveryCheck<Z extends Zone>(zones: Z[], postal: string, orgId?: string | null) {
  const z = await findZone(zones.filter((x) => x.active), { postalCode: postal }, orgId);
  return { postal, served: !!z, area: z?.name ?? null, window: z ? (windowOf(z.slotWindow) ?? z.slotWindow) : null };
}
