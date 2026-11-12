"use server";

import { ValidationError } from "@foundry/commons";
import { revalidateDelivery } from "@/lib/revalidate";
import type { DeliveryTypeInput, ZoneInput } from "@foundry/delivery";
import { resolveAndPersist } from "@foundry/places";
import {
  deliveryService,
  type DeliveryChargeRuleInput,
  type DeliveryStrategyGroupInput,
} from "@/lib/services/delivery.service";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { evictPublicPages } from "@/lib/landing/public-cache";

const DELIVERY = { guard: "admin", catalog: true } as const;

// Charges half: payloads ride in `value` (the @foundry/delivery charges UI expects the bare result; see delivery-clients.tsx).

export async function updateBaseChargeAction(amount: number) {
  return staffAction(DELIVERY, async () => {
    const value = await deliveryService.updateBaseDeliveryCharge(amount, await resolveRequestOrg());
    revalidateDelivery();
    return { value };
  });
}

export async function saveDeliveryStrategyAction(input: DeliveryChargeRuleInput) {
  return staffAction(DELIVERY, async () => {
    const value = await deliveryService.saveDeliveryStrategy(input, await resolveRequestOrg());
    revalidateDelivery();
    return { value };
  });
}

export async function deleteDeliveryStrategyAction(id: string) {
  return staffAction(DELIVERY, async () => {
    const value = await deliveryService.deleteDeliveryStrategy(id, await resolveRequestOrg());
    revalidateDelivery();
    return { value };
  });
}

export async function saveDeliveryStrategyGroupAction(input: DeliveryStrategyGroupInput) {
  return staffAction(DELIVERY, async () => {
    const value = await deliveryService.saveDeliveryStrategyGroup(input, await resolveRequestOrg());
    revalidateDelivery();
    return { value };
  });
}

export async function deleteDeliveryStrategyGroupAction(id: string) {
  return staffAction(DELIVERY, async () => {
    const value = await deliveryService.deleteDeliveryStrategyGroup(id, await resolveRequestOrg());
    revalidateDelivery();
    return { value };
  });
}

export async function connectDeliveryStrategyAction(id: string, connectedTo: string[]) {
  return staffAction(DELIVERY, async () => {
    const value = await deliveryService.connectDeliveryStrategy(id, connectedTo, await resolveRequestOrg());
    revalidateDelivery({ frequencies: false });
    return { value };
  });
}

export async function saveAddressTagAction(input: DeliveryChargeRuleInput) {
  return staffAction(DELIVERY, async () => {
    const value = await deliveryService.saveAddressTag(input, await resolveRequestOrg());
    revalidateDelivery();
    return { value };
  });
}

export async function deleteAddressTagAction(id: string) {
  return staffAction(DELIVERY, async () => {
    const value = await deliveryService.deleteAddressTag(id, await resolveRequestOrg());
    revalidateDelivery();
    return { value };
  });
}

// ── Zones, types and store origin ───────────────────────────────────────────

export async function saveZoneAction(input: ZoneInput) {
  return staffAction(DELIVERY, async () => {
    const zone = await deliveryService.saveZone(input, await resolveRequestOrg());
    revalidateDelivery({ charges: false });
    return { radiusKm: zone.radiusKm, publicId: zone.publicId };
  });
}

export async function retireZoneAction(publicId: string): Promise<ActionResult> {
  return staffAction(DELIVERY, async () => {
    await deliveryService.retireZone(publicId, await resolveRequestOrg());
    revalidateDelivery({ charges: false });
  });
}

export async function setZoneTypesAction(zonePublicId: string, typePublicIds: string[]): Promise<ActionResult> {
  return staffAction(DELIVERY, async () => {
    await deliveryService.setZoneTypes(zonePublicId, typePublicIds, await resolveRequestOrg());
    revalidateDelivery({ charges: false });
  });
}

export async function saveStoreOriginAction(lat: number, lng: number): Promise<ActionResult> {
  return staffAction(DELIVERY, async () => {
    await deliveryService.saveStoreOrigin(lat, lng, await resolveRequestOrg());
    await evictPublicPages();
    revalidateDelivery({ charges: false });
  });
}

/** Geocoded here, never in the browser, so the client can't assert its own coordinates. */
export async function saveStoreOriginFromAddressAction(input: { placeId?: string; address: string }) {
  return staffAction(DELIVERY, async () => {
    const orgId = await resolveRequestOrg();
    const address = input.address.trim();
    if (!address && !input.placeId) throw new ValidationError("Enter an address first.");
    // resolveAndPersist: these coordinates are stored, so AWS only (see @foundry/places).
    const hit = await resolveAndPersist({ placeId: input.placeId, address }).catch(() => null);
    if (!hit) throw new ValidationError("Couldn't find that address — try adding city and postal code.");
    await deliveryService.saveStoreOrigin(hit.lat, hit.lng, orgId);
    await evictPublicPages();
    revalidateDelivery({ charges: false });
    return { lat: hit.lat, lng: hit.lng, formattedAddress: hit.formattedAddress };
  });
}

export async function saveDeliveryTypeAction(input: DeliveryTypeInput): Promise<ActionResult> {
  return staffAction(DELIVERY, async () => {
    await deliveryService.saveType(input, await resolveRequestOrg());
    revalidateDelivery({ charges: false });
  });
}

export async function retireDeliveryTypeAction(publicId: string): Promise<ActionResult> {
  return staffAction(DELIVERY, async () => {
    await deliveryService.retireType(publicId, await resolveRequestOrg());
    revalidateDelivery({ charges: false });
  });
}
