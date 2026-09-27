import type { ClientCatalogSnapshot } from "./types";

/** A delivery strategy as the customer sees it, under one tag, with its own price. */
export type DropOffOption = {
  publicId: string;
  name: string;
  chargeType: "none" | "fixed" | "percent";
  chargeValue: number;
  /** Its tag's public id. */
  groupId: string;
  /** Its connected set's public id; null = combines freely. */
  connectionId: string | null;
  /** Share of its fee waived by an active waiver (0 = none, 100 = free). */
  waivedPct: number;
};

/** A tag: the kind of place (Home, Apartment, Office). */
export type DropOffGroup = { publicId: string; name: string; description: string | null };

/** Strategies of one tag the customer picks at most one of. */
export type DropOffConnection = { publicId: string; name: string; groupId: string };

/** An active delivery-fee waiver, named as the admin named it ("Launch offer"). */
export type DropOffOffer = { name: string; percent: number };

export type DropOffCatalog = { groups: DropOffGroup[]; options: DropOffOption[]; connections: DropOffConnection[]; offers: DropOffOffer[] };

/** What the customer picked: at most one tag, and any of its strategies (one per connected set). */
export type DropOffValue = { tagId: string | null; strategyIds: string[] };

export const EMPTY_DROP_OFF: DropOffCatalog = { groups: [], options: [], connections: [], offers: [] };
export const NO_DROP_OFF: DropOffValue = { tagId: null, strategyIds: [] };

export function dropOffCatalog(dc: ClientCatalogSnapshot["deliveryCharges"] | undefined, waivers: ClientCatalogSnapshot["waivers"] = []): DropOffCatalog {
  if (!dc) return EMPTY_DROP_OFF;
  const list = waivers ?? [];
  // Mirrors the engine: a strategy's fee is waived by its strongest matching waiver.
  const waivedPct = (strategyId: string) =>
    Math.min(100, Math.max(0, ...list.filter((w) => w.kind === "waiver_delivery" || (w.kind === "waiver_strategy" && w.targetPublicId === strategyId)).map((w) => w.percent)));
  const options = dc.deliveryStrategies.flatMap((s) =>
    s.groupId
      ? [{ publicId: s.id, name: s.name, chargeType: s.chargeType, chargeValue: s.chargeValue, groupId: s.groupId, connectionId: s.connectionId ?? null, waivedPct: waivedPct(s.id) }]
      : [],
  );
  const offers = list.filter((w) => (w.kind === "waiver_delivery" || w.kind === "waiver_base") && w.percent > 0).map((w) => ({ name: w.name, percent: w.percent }));
  return { groups: dc.strategyGroups ?? [], options, connections: dc.strategyConnections ?? [], offers };
}

/** What a strategy adds, after waivers: "+$1.50", "+5%", or null when it costs nothing. */
export function dropOffFee(o: Pick<DropOffOption, "chargeType" | "chargeValue">): string | null {
  if (o.chargeType === "fixed" && o.chargeValue > 0) return `+$${o.chargeValue.toFixed(2)}`;
  if (o.chargeType === "percent" && o.chargeValue > 0) return `+${o.chargeValue}%`;
  return null;
}

/** Fee left to pay on a fixed-fee strategy; null when it's a percent (unknown until priced). */
const fixedCost = (o: DropOffOption) =>
  o.chargeType === "none" || o.chargeValue <= 0 || o.waivedPct >= 100 ? 0 : o.chargeType === "fixed" ? o.chargeValue * (1 - o.waivedPct / 100) : null;

/** A picked, paid strategy with a cheaper one in the same pick-one set — the address tip. */
export function cheaperDropOff(catalog: DropOffCatalog, value: DropOffValue): { picked: DropOffOption; alt: DropOffOption; saves: number } | null {
  for (const id of value.strategyIds) {
    const picked = catalog.options.find((o) => o.publicId === id);
    const cost = picked ? fixedCost(picked) : null;
    if (!picked?.connectionId || cost == null || cost <= 0) continue;
    const alt = catalog.options
      .filter((o) => o.connectionId === picked.connectionId && o.publicId !== id)
      .map((o) => ({ o, c: fixedCost(o) }))
      .filter((x): x is { o: DropOffOption; c: number } => x.c != null && x.c < cost)
      .sort((a, b) => a.c - b.c)[0];
    if (alt) return { picked, alt: alt.o, saves: Math.round((cost - alt.c) * 100) / 100 };
  }
  return null;
}

/** Picks a tag (null clears). A different tag drops the old tag's strategies. */
export function pickTag(value: DropOffValue, tagId: string | null): DropOffValue {
  return tagId === value.tagId ? value : { tagId, strategyIds: [] };
}

/**
 * Turns a strategy on or off. On: its tag becomes the picked tag, and any other pick in its
 * connected set is dropped, so a set never holds two.
 */
export function toggleStrategy(catalog: DropOffCatalog, value: DropOffValue, strategyId: string): DropOffValue {
  if (value.strategyIds.includes(strategyId)) return { ...value, strategyIds: value.strategyIds.filter((id) => id !== strategyId) };
  const o = catalog.options.find((x) => x.publicId === strategyId);
  if (!o) return value;
  const base = value.tagId === o.groupId ? value.strategyIds : [];
  const kept = o.connectionId ? base.filter((id) => catalog.options.find((x) => x.publicId === id)?.connectionId !== o.connectionId) : base;
  return { tagId: o.groupId, strategyIds: [...kept, strategyId] };
}

/** The pick in one connected set replaced (null clears it). */
export function pickInConnection(catalog: DropOffCatalog, value: DropOffValue, connectionId: string, strategyId: string | null): DropOffValue {
  const others = value.strategyIds.filter((id) => catalog.options.find((x) => x.publicId === id)?.connectionId !== connectionId);
  return strategyId ? toggleStrategy(catalog, { ...value, strategyIds: others }, strategyId) : { ...value, strategyIds: others };
}

/** Drops anything no longer offered: an unknown tag, strategies outside it, a second pick in a set. */
export function validDropOff(catalog: DropOffCatalog, value: DropOffValue | null | undefined): DropOffValue {
  if (!value?.tagId || !catalog.groups.some((g) => g.publicId === value.tagId)) return NO_DROP_OFF;
  const seen = new Set<string>();
  const strategyIds = value.strategyIds.filter((id) => {
    const o = catalog.options.find((x) => x.publicId === id && x.groupId === value.tagId);
    if (!o) return false;
    if (o.connectionId) {
      if (seen.has(o.connectionId)) return false;
      seen.add(o.connectionId);
    }
    return true;
  });
  return { tagId: value.tagId, strategyIds };
}

/** "Apartment: Lobby, Call on arrival" for read-only rows; "" when nothing is picked. */
export function dropOffSummary(catalog: DropOffCatalog, value: DropOffValue | null | undefined): string {
  const v = validDropOff(catalog, value);
  const tag = catalog.groups.find((g) => g.publicId === v.tagId);
  if (!tag) return "";
  const names = v.strategyIds.map((id) => catalog.options.find((o) => o.publicId === id)!.name);
  return names.length ? `${tag.name}: ${names.join(", ")}` : tag.name;
}
