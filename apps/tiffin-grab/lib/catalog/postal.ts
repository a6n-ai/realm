export interface ZoneLike {
  name: string;
  postalPrefixes: string[];
  slotWindow: string;
  active: boolean;
}

export function matchZone(postalCode: string, zones: ZoneLike[]): ZoneLike | null {
  const fsa = postalCode.replace(/\s+/g, "").toUpperCase().slice(0, 3);
  if (!fsa) return null;

  let best: { zone: ZoneLike; len: number } | null = null;
  for (const zone of zones) {
    if (!zone.active) continue;
    for (const prefix of zone.postalPrefixes) {
      const p = prefix.toUpperCase();
      if (fsa.startsWith(p) && (!best || p.length > best.len)) {
        best = { zone, len: p.length };
      }
    }
  }
  return best?.zone ?? null;
}
