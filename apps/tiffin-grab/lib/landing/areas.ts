// Delivery areas on /locations: each zone is one anchored row (/locations#brampton). Pure: callers
// pass catalog zones.

type Zone = { name: string; active: boolean; postalPrefixes: string[]; slotWindow: string | null };

/** "Richmond Hill" -> "richmond-hill", "Queen's Park" -> "queens-park": the row's anchor id. */
export const areaSlug = (name: string) =>
  name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export type Window = { from: string; to: string; fromHour: number; toHour: number };

/** "11:00 AM – 2:00 PM" -> { from: "11 AM", to: "2 PM", fromHour: 11, toHour: 14 }; null if it doesn't parse. */
export function parseWindow(slot: string | null): Window | null {
  const times = [...(slot ?? "").matchAll(/(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M\.?/gi)];
  if (times.length < 2) return null;
  const read = (m: RegExpMatchArray) => {
    const h = Number(m[1]) % 12 + (m[3]!.toUpperCase() === "P" ? 12 : 0);
    const min = Number(m[2] ?? 0);
    const label = `${Number(m[1])}${min ? `:${m[2]}` : ""} ${m[3]!.toUpperCase()}M`;
    return { label, hour: h + min / 60 };
  };
  const [a, b] = [read(times[0]!), read(times[1]!)];
  return b.hour > a.hour ? { from: a.label, to: b.label, fromHour: a.hour, toHour: b.hour } : null;
}

/** Prefixes this zone shares with another active zone ("L4J" with Thornhill, "M4B" inside Toronto's "M4"). */
export function sharedPrefixes<Z extends Zone>(zone: Z, zones: Z[]): Map<string, Z[]> {
  const out = new Map<string, Z[]>();
  for (const p of zone.postalPrefixes) {
    const others = zones.filter((o) => o !== zone && o.active && o.postalPrefixes.some((q) => q.startsWith(p) || p.startsWith(q)));
    if (others.length) out.set(p, others);
  }
  return out;
}

export type Run<Z> = { key: string; label: string; start: number; zones: Z[] };

/** One run per delivery window, earliest first; a window that does not parse keeps its stored text. */
export function runsOf<Z extends Zone>(zones: Z[]): Run<Z>[] {
  const byRun = new Map<string, Run<Z>>();
  for (const z of zones) {
    const w = parseWindow(z.slotWindow);
    const key = w ? `${w.fromHour}-${w.toHour}` : (z.slotWindow ?? "any");
    const run = byRun.get(key) ?? { key, label: w ? `${w.from} to ${w.to}` : (z.slotWindow ?? "Any time"), start: w?.fromHour ?? 99, zones: [] };
    run.zones.push(z);
    byRun.set(key, run);
  }
  return [...byRun.values()].sort((a, b) => a.start - b.start);
}

/** The zone that owns each district (postal area, "M5V"): the one with the longest matching prefix,
 *  so East York's "M4B" beats Toronto's "M4". Districts no zone lists are left out. */
export function districtOwners<Z extends Zone>(zones: Z[], districtIds: string[]): Map<string, Z> {
  const out = new Map<string, Z>();
  for (const id of districtIds) {
    let best: Z | null = null, len = 0;
    for (const z of zones) for (const p of z.postalPrefixes) {
      const q = p.replace(/\s/g, "").toUpperCase();
      if (q && id.startsWith(q) && q.length > len) { best = z; len = q.length; }
    }
    if (best) out.set(id, best);
  }
  return out;
}
