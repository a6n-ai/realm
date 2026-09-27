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
  /** Fixed charges: once per order or per delivery. */
  chargeBasis?: "once" | "per_delivery";
};

/** A tag: the kind of place (Home, Apartment, Office). */
export type DropOffGroup = { publicId: string; name: string; description: string | null };

/** Strategies of one tag the customer picks at most one of. */
export type DropOffConnection = { publicId: string; name: string; groupId: string };

export type DropOffCatalog = { groups: DropOffGroup[]; options: DropOffOption[]; connections: DropOffConnection[] };

/** What the customer picked: at most one tag, and any of its strategies (one per connected set). */
export type DropOffValue = { tagId: string | null; strategyIds: string[] };

export const EMPTY_DROP_OFF: DropOffCatalog = { groups: [], options: [], connections: [] };
export const NO_DROP_OFF: DropOffValue = { tagId: null, strategyIds: [] };

export function dropOffCatalog(dc: ClientCatalogSnapshot["deliveryCharges"] | undefined): DropOffCatalog {
  if (!dc) return EMPTY_DROP_OFF;
  const options = dc.deliveryStrategies.flatMap((s) =>
    s.groupId
      ? [{ publicId: s.id, name: s.name, chargeType: s.chargeType, chargeValue: s.chargeValue, groupId: s.groupId, connectionId: s.connectionId ?? null, chargeBasis: s.chargeBasis }]
      : [],
  );
  return { groups: dc.strategyGroups ?? [], options, connections: dc.strategyConnections ?? [] };
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

/** "Back door · +$1.50", "Door · +$1.50 / delivery", "Lobby · +5%", or just the name when free. */
export function dropOffLabel(o: Pick<DropOffOption, "name" | "chargeType" | "chargeValue" | "chargeBasis">): string {
  if (o.chargeType === "fixed" && o.chargeValue > 0) {
    return `${o.name} · +$${o.chargeValue.toFixed(2)}${o.chargeBasis === "per_delivery" ? " / delivery" : ""}`;
  }
  if (o.chargeType === "percent" && o.chargeValue > 0) return `${o.name} · +${o.chargeValue}%`;
  return o.name;
}

/** "Apartment: Lobby, Call on arrival" for read-only rows; "" when nothing is picked. */
export function dropOffSummary(catalog: DropOffCatalog, value: DropOffValue | null | undefined): string {
  const v = validDropOff(catalog, value);
  const tag = catalog.groups.find((g) => g.publicId === v.tagId);
  if (!tag) return "";
  const names = v.strategyIds.map((id) => catalog.options.find((o) => o.publicId === id)!.name);
  return names.length ? `${tag.name}: ${names.join(", ")}` : tag.name;
}
