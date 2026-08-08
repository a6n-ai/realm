import { eq } from "drizzle-orm";
import { UpdatableRepository } from "@realm/database";
import { db } from "@/db/client";
import { app, deliveryZones } from "@/db/schema";
import { SessionUpdatableService } from "@/lib/services/session-service";
import { DEFAULT_STORE_LAT, DEFAULT_STORE_LNG } from "./distance";
import type { Zone } from "./zones";

type ZoneRow = {
  id?: bigint;
  name: string;
  radiusKm: string;
  feeAmount: string;
  discountPct: string;
  minSubtotal: string;
  requiresScheduling: boolean;
  active: boolean;
};

/** Drizzle returns `numeric` as a string; convert once at the boundary. */
export function rowToZone(row: ZoneRow): Zone {
  return {
    id: row.id,
    name: row.name,
    radiusKm: Number(row.radiusKm),
    feeAmount: Number(row.feeAmount),
    discountPct: Number(row.discountPct),
    minSubtotal: Number(row.minSubtotal),
    requiresScheduling: row.requiresScheduling,
    active: row.active,
  };
}

class ZoneService extends SessionUpdatableService<typeof deliveryZones> {}
const zoneService = new ZoneService(
  new UpdatableRepository(db, deliveryZones, deliveryZones.publicId, deliveryZones.id),
);

export async function getZones(): Promise<Zone[]> {
  const rows = await db.select().from(deliveryZones).where(eq(deliveryZones.active, true));
  return rows.map(rowToZone);
}

export async function getStoreOrigin(): Promise<{ lat: number; lng: number }> {
  const [row] = await db.select({ lat: app.storeLat, lng: app.storeLng }).from(app).limit(1);
  return {
    lat: row?.lat != null ? Number(row.lat) : DEFAULT_STORE_LAT,
    lng: row?.lng != null ? Number(row.lng) : DEFAULT_STORE_LNG,
  };
}

export async function saveZone(
  publicId: string | null,
  values: Record<string, unknown>,
): Promise<Zone> {
  const row = publicId ? await zoneService.update(publicId, values) : await zoneService.create(values);
  return rowToZone(row as unknown as ZoneRow);
}

export async function retireZone(publicId: string): Promise<Zone> {
  const row = await zoneService.update(publicId, { active: false });
  return rowToZone(row as unknown as ZoneRow);
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
