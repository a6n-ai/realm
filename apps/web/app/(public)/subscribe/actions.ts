"use server";

import { matchZone } from "@/lib/catalog/postal";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { priceSubscription, type PricingResult, type PricingSelections } from "@/lib/pricing";

export async function reprice(selections: PricingSelections): Promise<PricingResult> {
  const snapshot = await loadCatalogSnapshot();
  return priceSubscription(selections, buildPricingCatalog(snapshot, selections));
}

export async function validatePostal(postalCode: string): Promise<{ served: boolean; zone?: { id: string; name: string; slotWindow: string } }> {
  const snapshot = await loadCatalogSnapshot();
  const zone = matchZone(postalCode, snapshot.zones);
  if (!zone) return { served: false };
  const full = snapshot.zones.find((z) => z.name === zone.name)!;
  return { served: true, zone: { id: full.id, name: full.name, slotWindow: full.slotWindow } };
}
