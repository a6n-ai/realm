// Delivery-area landing pages (/locations/<slug>): which zones get one, their neighbours, and the
// facts each page is built from. Pure: the page passes in catalog zones.

type Zone = { name: string; active: boolean; postalPrefixes: string[]; slotWindow: string | null };

/** "Richmond Hill" -> "richmond-hill", "Queen's Park" -> "queens-park". */
export const areaSlug = (name: string) =>
  name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// One block of government buildings (M7A): no search demand of its own; it stays on /locations.
const NO_PAGE = new Set(["queens-park"]);

/** Active zones that get their own page. */
export function areaZones<Z extends Zone>(zones: Z[]): Z[] {
  return zones.filter((z) => z.active && !NO_PAGE.has(areaSlug(z.name)));
}

// Zones carry no coordinates, so neighbours are written by hand from the GTA map.
// ponytail: hand map; derive from zone centroids if zones start changing often.
const NEIGHBOURS: Record<string, string[]> = {
  brampton: ["mississauga", "vaughan", "etobicoke"],
  durham: ["scarborough", "markham"],
  "east-york": ["toronto", "north-york", "scarborough"],
  etobicoke: ["mississauga", "toronto", "brampton"],
  markham: ["richmond-hill", "scarborough", "thornhill", "durham"],
  mississauga: ["etobicoke", "brampton", "oakville"],
  "north-york": ["toronto", "east-york", "thornhill", "vaughan"],
  oakville: ["mississauga"],
  "richmond-hill": ["markham", "thornhill", "vaughan"],
  scarborough: ["east-york", "markham", "durham"],
  thornhill: ["vaughan", "richmond-hill", "markham", "north-york"],
  toronto: ["east-york", "north-york", "etobicoke"],
  vaughan: ["brampton", "thornhill", "north-york", "richmond-hill"],
};

/** Neighbouring zones that have a page, in map order. */
export function neighbours<Z extends Zone>(zone: Z, zones: Z[]): Z[] {
  const bySlug = new Map(areaZones(zones).map((z) => [areaSlug(z.name), z]));
  return (NEIGHBOURS[areaSlug(zone.name)] ?? []).flatMap((s) => bySlug.get(s) ?? []);
}

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
