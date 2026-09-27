import type { ClientCatalogSnapshot } from "./types";

/** A delivery strategy as the customer sees it: one choice under a tag. */
export type DropOffOption = {
  publicId: string;
  name: string;
  chargeType: "none" | "fixed" | "percent";
  chargeValue: number;
  /** Public id of its tag. */
  groupId: string;
};

/** A tag ("Drop-off spot"): shown first, then its strategies. */
export type DropOffGroup = { publicId: string; name: string; description: string | null; required: boolean };

export type DropOffCatalog = { groups: DropOffGroup[]; options: DropOffOption[] };

export const EMPTY_DROP_OFF: DropOffCatalog = { groups: [], options: [] };

/** Tags that have at least one strategy, and those strategies. */
export function dropOffCatalog(dc: ClientCatalogSnapshot["deliveryCharges"] | undefined): DropOffCatalog {
  if (!dc) return EMPTY_DROP_OFF;
  const options = dc.deliveryStrategies.flatMap((s) =>
    s.groupId ? [{ publicId: s.id, name: s.name, chargeType: s.chargeType, chargeValue: s.chargeValue, groupId: s.groupId }] : [],
  );
  const groups = (dc.strategyGroups ?? []).filter((g) => options.some((o) => o.groupId === g.publicId));
  return { groups, options };
}

/** Replaces the pick for `groupId` (null clears it), keeping one strategy per tag. */
export function pickDropOff(catalog: DropOffCatalog, picks: string[], groupId: string, optionId: string | null): string[] {
  const others = picks.filter((id) => catalog.options.find((o) => o.publicId === id)?.groupId !== groupId);
  return optionId ? [...others, optionId] : others;
}

/** Picks still offered, in tag order: stale or retired ids drop out. */
export function validDropOffs(catalog: DropOffCatalog, picks: string[] | undefined): string[] {
  return catalog.groups.flatMap((g) => {
    const hit = (picks ?? []).find((id) => catalog.options.some((o) => o.publicId === id && o.groupId === g.publicId));
    return hit ? [hit] : [];
  });
}

/** "Back door · +$1.50", "Lobby · +5%", or just the name when it is free. */
export function dropOffLabel(o: Pick<DropOffOption, "name" | "chargeType" | "chargeValue">): string {
  if (o.chargeType === "fixed" && o.chargeValue > 0) return `${o.name} · +$${o.chargeValue.toFixed(2)}`;
  if (o.chargeType === "percent" && o.chargeValue > 0) return `${o.name} · +${o.chargeValue}%`;
  return o.name;
}

/** "Drop-off spot: Lobby · Contact: Call on arrival" for read-only rows. */
export function dropOffSummary(catalog: DropOffCatalog, picks: string[] | undefined): string {
  return validDropOffs(catalog, picks)
    .map((id) => {
      const o = catalog.options.find((x) => x.publicId === id)!;
      return `${catalog.groups.find((g) => g.publicId === o.groupId)!.name}: ${o.name}`;
    })
    .join(" · ");
}
