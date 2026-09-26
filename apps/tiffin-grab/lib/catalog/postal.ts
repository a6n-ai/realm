import { matchPostalZone } from "@foundry/delivery";

export interface ZoneLike {
  name: string;
  postalPrefixes: string[];
  slotWindow: string | null;
  active: boolean;
  radiusKm?: number | null;
}

/** Postal-only match (client-safe) — longest active prefix wins. Circles need {@link findZone}. */
export function matchZone<Z extends ZoneLike>(postalCode: string, zones: Z[]): Z | null {
  const hit = matchPostalZone(postalCode, zones.map((z, i) => ({ ...z, radiusKm: z.radiusKm ?? null, publicId: String(i) })));
  return hit ? zones[Number(hit.publicId)]! : null;
}
