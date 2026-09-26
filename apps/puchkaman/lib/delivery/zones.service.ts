import { cache } from "react";
import { eq } from "drizzle-orm";
import { UpdatableRepository } from "@foundry/database";
import type { DeliveryType, ZoneWithTypes } from "@foundry/delivery";
import { createDeliveryService } from "@foundry/delivery/service";
import { db } from "@/db/client";
import {
  addressTags,
  app,
  deliveryChargeConfigs,
  deliveryChargeType,
  deliveryStrategies,
  deliveryTypes,
  deliveryZoneTypes,
  deliveryZones,
  organization,
} from "@/db/schema";
import { resolveActingOrgId } from "@/lib/services/integrations.service";
import { currentUserId, recordAudit, SessionUpdatableService } from "@/lib/services/session-service";
import { DEFAULT_STORE_LAT, DEFAULT_STORE_LNG } from "./distance";
import { ADDRESS as DEFAULT_STORE_ADDRESS } from "@/lib/links";

/**
 * The shared @foundry/delivery service. Every call takes the acting franchise's
 * org id so reads see its own + shared rows and writes can't touch another's.
 */
export const deliveryService = createDeliveryService({
  db,
  tables: {
    deliveryZones,
    deliveryTypes,
    deliveryZoneTypes,
    deliveryChargeType,
    deliveryChargeConfigs,
    deliveryStrategies,
    addressTags,
  },
  // Orders don't carry a strategy or tag yet, so nothing can be in use.
  isStrategyInUse: async () => false,
  isAddressTagInUse: async () => false,
  currentUserId,
  audit: async (e) => recordAudit({ ...e, createdBy: await currentUserId() }),
});

// Cached per-request (React cache()) — order/page.tsx calls this from both
// generateMetadata() and the page body, and both run within the same request.
export const getDeliveryTypes = cache(async (): Promise<DeliveryType[]> =>
  deliveryService.listTypes({ orgId: await resolveActingOrgId() }),
);

/** Every delivery type, retired included — the admin manages both, unlike {@link getDeliveryTypes}. */
export async function getAllDeliveryTypes(): Promise<DeliveryType[]> {
  return deliveryService.listTypes({ includeInactive: true, orgId: await resolveActingOrgId() });
}

/** Every zone (retired included) with the types it offers; matching skips inactive ones. */
export async function getZonesWithTypes(): Promise<ZoneWithTypes[]> {
  return deliveryService.listZones({ includeInactive: true, orgId: await resolveActingOrgId() });
}

/**
 * The point delivery distance is measured from. Resolves the ACTIVE
 * franchise's own storeLat/storeLng first (set on the Clients detail page —
 * see client-detail-form.tsx) — a delivery radius measured from the wrong
 * franchise's coordinates would accept or reject addresses on the wrong
 * basis entirely. Falls back to the app-table singleton (pre-multi-franchise
 * data, or a franchise with no pin set yet), then the hardcoded default.
 */
export async function getStoreOrigin(): Promise<{ lat: number; lng: number }> {
  const orgId = await resolveActingOrgId();
  const [orgRow] = orgId
    ? await db.select({ lat: organization.storeLat, lng: organization.storeLng }).from(organization).where(eq(organization.id, orgId)).limit(1)
    : [];
  if (orgRow?.lat != null && orgRow?.lng != null) {
    return { lat: Number(orgRow.lat), lng: Number(orgRow.lng) };
  }

  const [row] = await db.select({ lat: app.storeLat, lng: app.storeLng }).from(app).limit(1);
  return {
    lat: row?.lat != null ? Number(row.lat) : DEFAULT_STORE_LAT,
    lng: row?.lng != null ? Number(row.lng) : DEFAULT_STORE_LNG,
  };
}

/**
 * Same resolution as {@link getStoreOrigin}, plus the display text (address,
 * city) customers actually read on pickup/delivery copy. The app-table
 * singleton has no address/city columns (pre-multi-franchise), so that rung
 * of the fallback — and the hardcoded final default — both use the same
 * Scarborough address/coords getStoreOrigin falls back to, so the two never
 * disagree about which shop they mean.
 */
export async function getStoreLocation(): Promise<{ lat: number; lng: number; address: string; city: string | null }> {
  const orgId = await resolveActingOrgId();
  const [orgRow] = orgId
    ? await db
        .select({ lat: organization.storeLat, lng: organization.storeLng, address: organization.address, city: organization.city })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1)
    : [];
  if (orgRow?.lat != null && orgRow?.lng != null && orgRow.address) {
    return { lat: Number(orgRow.lat), lng: Number(orgRow.lng), address: orgRow.address, city: orgRow.city };
  }

  const origin = await getStoreOrigin();
  return { ...origin, address: DEFAULT_STORE_ADDRESS, city: null };
}

/** Type/zone labels for an order's delivery — resolves the FK ids the order row carries. */
export function getDeliveryLabelsForOrder(
  typeId: bigint | null,
  zoneId: bigint | null,
): Promise<{ typeLabel: string | null; zoneName: string | null }> {
  return deliveryService.labelsForOrder(typeId, zoneId);
}

/**
 * `app` is a singleton row (same pattern as {@link getIntegrationsConfig} in
 * integrations.service.ts): update if it exists, otherwise create it.
 */
class AppService extends SessionUpdatableService<typeof app> {}
const appRepository = new UpdatableRepository(db, app, app.publicId, app.id);
const appService = new AppService(appRepository);

export async function saveStoreOrigin(lat: number, lng: number): Promise<void> {
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) {
    await appService.update(row.publicId, { storeLat: String(lat), storeLng: String(lng) });
  } else {
    await appService.create({ storeLat: String(lat), storeLng: String(lng) });
  }
}
