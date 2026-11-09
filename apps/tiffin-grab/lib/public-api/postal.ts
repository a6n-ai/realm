import { parseWindow } from "@/lib/landing/areas";

const FSA = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]$/;
const LDU = /^\d[ABCEGHJ-NPRSTV-Z]\d$/;

export const POSTAL_HINT = "postal must be a Canadian postal code or its first three characters, like M5V 2T6";

/** "m5v 2t6" -> "M5V2T6"; null unless it is a Canadian FSA (M5V) or a full postal code. */
export function normalizePostal(raw: string | null | undefined): string | null {
  const p = (raw ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (p.length === 3) return FSA.test(p) ? p : null;
  return p.length === 6 && FSA.test(p.slice(0, 3)) && LDU.test(p.slice(3)) ? p : null;
}

type Zone = { name: string; active: boolean; postalPrefixes: string[]; slotWindow: string | null };

export const windowOf = (slot: string | null) => {
  const w = parseWindow(slot);
  return w ? { from: w.from, to: w.to } : null;
};

/** The active zone with the longest prefix of the postal code, so East York's "M4B" beats Toronto's "M4". */
export function zoneForPostal<Z extends Zone>(zones: Z[], postal: string): Z | null {
  let best: Z | null = null, len = 0;
  for (const z of zones) {
    if (!z.active) continue;
    for (const p of z.postalPrefixes) {
      const q = p.replace(/\s/g, "").toUpperCase();
      if (q && postal.startsWith(q) && q.length > len) { best = z; len = q.length; }
    }
  }
  return best;
}

export function deliveryCheck<Z extends Zone>(zones: Z[], postal: string) {
  const z = zoneForPostal(zones, postal);
  return { postal, served: !!z, area: z?.name ?? null, window: z ? (windowOf(z.slotWindow) ?? z.slotWindow) : null };
}
