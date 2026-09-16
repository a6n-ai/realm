import type { TaxLine } from "@foundry/payments";

/**
 * Canadian destination-based sales tax.
 *
 * Sales tax here is determined by the DELIVERY province, not by the payment
 * method — the same e-Transfer owes 13% HST to an Ontario address and 5% GST to
 * an Alberta one. `@foundry/payments` models taxes per payment method, which is
 * the right axis for a surcharge but the wrong one for this; so this module
 * resolves the province's lines and hands them to the same
 * `TaxLine[]` -> priceSubscription(...) path, reusing Foundry's shapes and its
 * post-discount `computeTax` semantics rather than forking them.
 *
 * App-local for now per AGENTS.md ("stays in apps/<client> until a second client
 * proves it genuinely shared"). Puchkaman is also Canadian, so this is a likely
 * candidate to graduate into @foundry/payments later.
 *
 * ⚠️ RATES ARE DEFAULTS, NOT TAX ADVICE. Two things need a real accountant's
 * sign-off before this bills anyone:
 *   1. Whether prepared tiffin meals are taxable at all. Basic groceries are
 *      GST/HST zero-rated; prepared/ready-to-eat food generally is not. Ontario
 *      additionally rebates the provincial portion on prepared food ≤ $4.
 *   2. The provincial-only lines. BC PST, MB RST and SK PST each exempt most
 *      food, so those lines may need to be 0 even though the province has a PST.
 * Every rate below is admin-editable (Settings -> Payments) precisely so these
 * can be corrected without a deploy.
 */

export const PROVINCES = [
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
] as const;

export type Province = (typeof PROVINCES)[number];

export const PROVINCE_LABEL: Record<Province, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

/**
 * Standard combined rates, seeded as editable defaults.
 * NOTE: Nova Scotia's HST dropped from 15% to 14% on 2025-04-01 — verify this is
 * still current before relying on it.
 */
export const DEFAULT_PROVINCE_TAXES: Record<Province, TaxLine[]> = {
  AB: [{ name: "GST", ratePct: 5 }],
  BC: [{ name: "GST", ratePct: 5 }, { name: "PST", ratePct: 7 }],
  MB: [{ name: "GST", ratePct: 5 }, { name: "RST", ratePct: 7 }],
  NB: [{ name: "HST", ratePct: 15 }],
  NL: [{ name: "HST", ratePct: 15 }],
  NS: [{ name: "HST", ratePct: 14 }],
  NT: [{ name: "GST", ratePct: 5 }],
  NU: [{ name: "GST", ratePct: 5 }],
  ON: [{ name: "HST", ratePct: 13 }],
  PE: [{ name: "HST", ratePct: 15 }],
  QC: [{ name: "GST", ratePct: 5 }, { name: "QST", ratePct: 9.975 }],
  SK: [{ name: "GST", ratePct: 5 }, { name: "PST", ratePct: 6 }],
  YT: [{ name: "GST", ratePct: 5 }],
};

/**
 * First letter of a Canadian postal code -> province.
 * X covers both NT and NU; they carry identical tax (5% GST), so collapsing them
 * to NT changes no amount — only the label on an internal report.
 */
const POSTAL_PREFIX: Record<string, Province> = {
  A: "NL", B: "NS", C: "PE", E: "NB",
  G: "QC", H: "QC", J: "QC",
  K: "ON", L: "ON", M: "ON", N: "ON", P: "ON",
  R: "MB", S: "SK", T: "AB", V: "BC",
  X: "NT", Y: "YT",
};

export function isProvince(value: string): value is Province {
  return (PROVINCES as readonly string[]).includes(value);
}

/** Normalise free-text province input ("ontario", " on ", "ON") to a code. */
export function normalizeProvince(raw: string | null | undefined): Province | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (isProvince(upper)) return upper;
  const byName = (Object.entries(PROVINCE_LABEL) as [Province, string][]).find(
    ([, label]) => label.toLowerCase() === trimmed.toLowerCase(),
  );
  return byName?.[0] ?? null;
}

/** Province implied by a Canadian postal code's first letter. */
export function provinceFromPostalCode(postalCode: string | null | undefined): Province | null {
  if (!postalCode) return null;
  const first = postalCode.trim().charAt(0).toUpperCase();
  return POSTAL_PREFIX[first] ?? null;
}

/**
 * Resolve the delivery province, preferring an explicit value and falling back
 * to the postal code. Returns null when neither yields a province — callers
 * decide what that means (see resolveTaxLines).
 */
export function resolveProvince(input: {
  province?: string | null;
  postalCode?: string | null;
}): Province | null {
  return normalizeProvince(input.province) ?? provinceFromPostalCode(input.postalCode);
}

/**
 * Tax lines for a delivery destination.
 *
 * An unresolvable province returns [] — no tax rather than a guessed rate.
 * Charging a province's tax to an address we could not identify would be worse
 * than charging none: it is someone else's money remitted to the wrong
 * jurisdiction. Checkout surfaces this as "Tax calculated at checkout" and the
 * address step already requires a postal code, so this is a narrow edge.
 */
export function resolveTaxLines(
  input: { province?: string | null; postalCode?: string | null },
  overrides?: Partial<Record<Province, TaxLine[]>>,
): TaxLine[] {
  const province = resolveProvince(input);
  if (!province) return [];
  const lines = overrides?.[province] ?? DEFAULT_PROVINCE_TAXES[province];
  // Drop zero-rate lines so the receipt doesn't print "PST 0% — $0.00".
  return lines.filter((l) => l.ratePct > 0);
}
