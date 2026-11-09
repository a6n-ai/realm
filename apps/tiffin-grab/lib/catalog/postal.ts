import { ValidationError } from "@foundry/commons";
import { matchPostalZone } from "@foundry/delivery";

// Canada Post format A1A 1A1. D, F, I, O, Q, U never appear; W and Z never start one.
const FSA = "[ABCEGHJ-NPRSTVXY]\\d[ABCEGHJ-NPRSTV-Z]";
const FSA_ONLY = new RegExp(`^${FSA}$`);
const CANADIAN_POSTAL = new RegExp(`^${FSA}\\d[ABCEGHJ-NPRSTV-Z]\\d$`);

/** A Canadian forward sortation area ("M5V"), as the public API accepts it alongside a full code. */
export const isPostalFsa = (raw: string): boolean => FSA_ONLY.test(raw);

/** A full Canadian postal code, normalized to "A1A 1A1". A bare prefix like "M8" matched
 * a zone and let an undeliverable order through, so every address and order goes here. */
export function parseCanadianPostalCode(raw: string | null | undefined): string {
  const compact = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  if (!isFullPostalCode(compact)) throw new ValidationError("Enter a full postal code, like M5V 2T6");
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

/** Client-safe twin of {@link parseCanadianPostalCode}: gate a form before the server refuses it. */
export function isFullPostalCode(raw: string | null | undefined): boolean {
  return CANADIAN_POSTAL.test((raw ?? "").replace(/\s+/g, "").toUpperCase());
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

/** "m5v 2t6" -> "M5V2T6"; null unless it is a Canadian FSA (M5V) or a full postal code. Pure: the builder's
 *  client-side delivery check uses it, so it must not sit next to the zone lookup (which loads the catalog). */
export function normalizePostal(raw: string | null | undefined): string | null {
  const p = (raw ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (p.length === 3) return isPostalFsa(p) ? p : null;
  return p.length === 6 && isFullPostalCode(p) ? p : null;
}
