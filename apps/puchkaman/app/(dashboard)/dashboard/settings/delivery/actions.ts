"use server";

import { revalidatePath } from "next/cache";
import type { DeliveryChargeRuleInput, DeliveryTypeInput, ZoneInput } from "@foundry/delivery";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveAddress } from "@/lib/delivery/resolve-address";
import { deliveryService, saveStoreOrigin } from "@/lib/delivery/zones.service";
import { resolveActingOrgId } from "@/lib/services/integrations.service";

function revalidate() {
  revalidatePath("/dashboard/settings/delivery", "layout");
}

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

async function adminOrg() {
  await requireAdmin();
  return resolveActingOrgId();
}

export async function saveZoneAction(input: ZoneInput): Promise<{ error?: string; radiusKm?: number | null; publicId?: string }> {
  const orgId = await adminOrg();
  try {
    const zone = await deliveryService.saveZone(input, orgId);
    revalidate();
    return { radiusKm: zone.radiusKm, publicId: zone.publicId };
  } catch (err) {
    return { error: message(err, "Save failed") };
  }
}

export async function retireZoneAction(publicId: string): Promise<{ error?: string }> {
  const orgId = await adminOrg();
  try {
    await deliveryService.retireZone(publicId, orgId);
  } catch (err) {
    return { error: message(err, "Retire failed") };
  }
  revalidate();
  return {};
}

export async function setZoneTypesAction(zonePublicId: string, typePublicIds: string[]): Promise<{ error?: string }> {
  const orgId = await adminOrg();
  try {
    await deliveryService.setZoneTypes(zonePublicId, typePublicIds, orgId);
  } catch (err) {
    return { error: message(err, "Save failed") };
  }
  revalidate();
  return {};
}

export async function saveStoreOriginAction(lat: number, lng: number): Promise<{ error?: string }> {
  await requireAdmin();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "Invalid coordinates" };
  }
  // saveStoreOrigin routes through SessionUpdatableService, which audits the change.
  await saveStoreOrigin(lat, lng);
  revalidate();
  return {};
}

/**
 * Set the shop origin from a typed address. Geocoding happens here, not in the
 * browser: the client sends only text, so it can never assert its own coordinates.
 */
export async function saveStoreOriginFromAddressAction(input: {
  placeId?: string;
  address: string;
}): Promise<{ error?: string; lat?: number; lng?: number; formattedAddress?: string }> {
  await requireAdmin();
  const address = input.address.trim();
  if (!address && !input.placeId) return { error: "Enter an address first." };

  const hit = await resolveAddress({ placeId: input.placeId, address });
  if (!hit) return { error: "Couldn't find that address — try adding city and postal code." };

  await saveStoreOrigin(hit.lat, hit.lng);
  revalidate();
  return { lat: hit.lat, lng: hit.lng, formattedAddress: hit.formattedAddress };
}

export async function saveDeliveryTypeAction(input: DeliveryTypeInput): Promise<{ error?: string }> {
  const orgId = await adminOrg();
  try {
    await deliveryService.saveType(input, orgId);
  } catch (err) {
    return { error: message(err, "Save failed") };
  }
  revalidate();
  return {};
}

export async function retireDeliveryTypeAction(publicId: string): Promise<{ error?: string }> {
  const orgId = await adminOrg();
  try {
    await deliveryService.retireType(publicId, orgId);
  } catch (err) {
    return { error: message(err, "Retire failed") };
  }
  revalidate();
  return {};
}

export async function updateBaseChargeAction(amount: number): Promise<number> {
  const orgId = await adminOrg();
  const result = await deliveryService.updateBaseDeliveryCharge(amount, orgId);
  revalidate();
  return result;
}

export async function saveDeliveryStrategyAction(input: DeliveryChargeRuleInput) {
  const orgId = await adminOrg();
  const result = await deliveryService.saveDeliveryStrategy(input, orgId);
  revalidate();
  return result;
}

export async function deleteDeliveryStrategyAction(id: string) {
  const orgId = await adminOrg();
  const result = await deliveryService.deleteDeliveryStrategy(id, orgId);
  revalidate();
  return result;
}

export async function saveAddressTagAction(input: DeliveryChargeRuleInput) {
  const orgId = await adminOrg();
  const result = await deliveryService.saveAddressTag(input, orgId);
  revalidate();
  return result;
}

export async function deleteAddressTagAction(id: string) {
  const orgId = await adminOrg();
  const result = await deliveryService.deleteAddressTag(id, orgId);
  revalidate();
  return result;
}
