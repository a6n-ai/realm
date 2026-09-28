import { ValidationError } from "@foundry/commons";
import { matchPostalZone } from "@foundry/delivery";

// Canada Post format A1A 1A1. D, F, I, O, Q, U never appear; W and Z never start one.
const CANADIAN_POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;

/** A full Canadian postal code, normalized to "A1A 1A1". A bare prefix like "M8" matched
 * a zone and let an undeliverable order through, so every address and order goes here. */
export function parseCanadianPostalCode(raw: string | null | undefined): string {
  const compact = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  if (!CANADIAN_POSTAL.test(compact)) throw new ValidationError("Enter a full postal code, like M5V 2T6");
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

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
