"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import type { DeliveryTypeInput, ZoneInput } from "@foundry/delivery";
import { resolveAndPersist } from "@foundry/places";
import {
  deliveryService,
  type DeliveryChargeRuleInput,
} from "@/lib/services/delivery.service";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";

export async function updateBaseChargeAction(amount: number): Promise<number> {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const result = await deliveryService.updateBaseDeliveryCharge(amount, orgId);
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/delivery/charges");
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
  return result;
}

export async function saveDeliveryStrategyAction(input: DeliveryChargeRuleInput) {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const result = await deliveryService.saveDeliveryStrategy(input, orgId);
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/delivery/charges");
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
  return result;
}

export async function deleteDeliveryStrategyAction(id: string) {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const result = await deliveryService.deleteDeliveryStrategy(id, orgId);
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/delivery/charges");
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
  return result;
}

export async function saveAddressTagAction(input: DeliveryChargeRuleInput) {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const result = await deliveryService.saveAddressTag(input, orgId);
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/delivery/charges");
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
  return result;
}

export async function deleteAddressTagAction(id: string) {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const result = await deliveryService.deleteAddressTag(id, orgId);
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/delivery/charges");
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
  return result;
}

// ── Zones, types and store origin ───────────────────────────────────────────

async function adminOrg() {
  await requireAdmin();
  return resolveRequestOrg();
}

async function refreshDelivery() {
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
}

const failure = (err: unknown, fallback: string) => ({ error: err instanceof Error ? err.message : fallback });

export async function saveZoneAction(input: ZoneInput): Promise<{ error?: string; radiusKm?: number | null; publicId?: string }> {
  const orgId = await adminOrg();
  try {
    const zone = await deliveryService.saveZone(input, orgId);
    await refreshDelivery();
    return { radiusKm: zone.radiusKm, publicId: zone.publicId };
  } catch (err) {
    return failure(err, "Save failed");
  }
}

export async function retireZoneAction(publicId: string): Promise<{ error?: string }> {
  const orgId = await adminOrg();
  try {
    await deliveryService.retireZone(publicId, orgId);
    await refreshDelivery();
    return {};
  } catch (err) {
    return failure(err, "Retire failed");
  }
}

export async function setZoneTypesAction(zonePublicId: string, typePublicIds: string[]): Promise<{ error?: string }> {
  const orgId = await adminOrg();
  try {
    await deliveryService.setZoneTypes(zonePublicId, typePublicIds, orgId);
    await refreshDelivery();
    return {};
  } catch (err) {
    return failure(err, "Save failed");
  }
}

export async function saveStoreOriginAction(lat: number, lng: number): Promise<{ error?: string }> {
  const orgId = await adminOrg();
  try {
    await deliveryService.saveStoreOrigin(lat, lng, orgId);
    await refreshDelivery();
    return {};
  } catch (err) {
    return failure(err, "Save failed");
  }
}

/** Geocoded here, never in the browser, so the client can't assert its own coordinates. */
export async function saveStoreOriginFromAddressAction(input: {
  placeId?: string;
  address: string;
}): Promise<{ error?: string; lat?: number; lng?: number; formattedAddress?: string }> {
  const orgId = await adminOrg();
  const address = input.address.trim();
  if (!address && !input.placeId) return { error: "Enter an address first." };
  // resolveAndPersist: these coordinates are stored, so AWS only (see @foundry/places).
  const hit = await resolveAndPersist({ placeId: input.placeId, address }).catch(() => null);
  if (!hit) return { error: "Couldn't find that address — try adding city and postal code." };
  await deliveryService.saveStoreOrigin(hit.lat, hit.lng, orgId);
  await refreshDelivery();
  return { lat: hit.lat, lng: hit.lng, formattedAddress: hit.formattedAddress };
}

export async function saveDeliveryTypeAction(input: DeliveryTypeInput): Promise<{ error?: string }> {
  const orgId = await adminOrg();
  try {
    await deliveryService.saveType(input, orgId);
    await refreshDelivery();
    return {};
  } catch (err) {
    return failure(err, "Save failed");
  }
}

export async function retireDeliveryTypeAction(publicId: string): Promise<{ error?: string }> {
  const orgId = await adminOrg();
  try {
    await deliveryService.retireType(publicId, orgId);
    await refreshDelivery();
    return {};
  } catch (err) {
    return failure(err, "Retire failed");
  }
}
