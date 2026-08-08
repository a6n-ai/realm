import { eq } from "drizzle-orm";
import { UpdatableRepository } from "@realm/database";
import { db } from "@/db/client";
import { app, deliveryTypes, deliveryZoneTypes, deliveryZones } from "@/db/schema";
import { SessionUpdatableService } from "@/lib/services/session-service";
import { DEFAULT_STORE_LAT, DEFAULT_STORE_LNG } from "./distance";
import type { DeliveryType, Zone, ZoneWithTypes } from "./zones";

type ZoneRow = {
  id?: bigint;
  publicId?: string;
  name: string;
  radiusKm: string;
  active: boolean;
};

/** Drizzle returns `numeric` as a string; convert once at the boundary. */
export function rowToZone(row: ZoneRow): Zone {
  return {
    id: row.id,
    publicId: row.publicId,
    name: row.name,
    radiusKm: Number(row.radiusKm),
    active: row.active,
  };
}

type TypeRow = {
  id?: bigint;
  publicId?: string;
  key: string;
  label: string;
  description?: string | null;
  requiresAddress: boolean;
  requiresSchedule: boolean;
  minSubtotal: string;
  discountPct: string;
  sortOrder: number;
  active: boolean;
};

/** Drizzle returns `numeric` as a string; convert once at the boundary, same discipline as {@link rowToZone}. */
export function rowToType(row: TypeRow): DeliveryType {
  return {
    id: row.id,
    publicId: row.publicId,
    key: row.key,
    label: row.label,
    description: row.description,
    requiresAddress: row.requiresAddress,
    requiresSchedule: row.requiresSchedule,
    minSubtotal: Number(row.minSubtotal),
    discountPct: Number(row.discountPct),
    sortOrder: row.sortOrder,
    active: row.active,
  };
}

class ZoneService extends SessionUpdatableService<typeof deliveryZones> {}
const zoneService = new ZoneService(
  new UpdatableRepository(db, deliveryZones, deliveryZones.publicId, deliveryZones.id),
);

class TypeService extends SessionUpdatableService<typeof deliveryTypes> {}
const typeService = new TypeService(
  new UpdatableRepository(db, deliveryTypes, deliveryTypes.publicId, deliveryTypes.id),
);

export async function getZones(): Promise<Zone[]> {
  const rows = await db.select().from(deliveryZones).where(eq(deliveryZones.active, true));
  return rows.map(rowToZone);
}

export async function getDeliveryTypes(): Promise<DeliveryType[]> {
  const rows = await db
    .select()
    .from(deliveryTypes)
    .where(eq(deliveryTypes.active, true))
    .orderBy(deliveryTypes.sortOrder);
  return rows.map(rowToType);
}

/** Every delivery type, retired included — the catalogue admin manages both, unlike {@link getDeliveryTypes}. */
export async function getAllDeliveryTypes(): Promise<DeliveryType[]> {
  const rows = await db.select().from(deliveryTypes).orderBy(deliveryTypes.sortOrder);
  return rows.map(rowToType);
}

/**
 * Every zone with the delivery types it offers, in one query (zones LEFT JOIN
 * the join table LEFT JOIN types) grouped in JS — never N+1 per zone.
 */
export async function getZonesWithTypes(): Promise<ZoneWithTypes[]> {
  const rows = await db
    .select({ zone: deliveryZones, type: deliveryTypes })
    .from(deliveryZones)
    .leftJoin(deliveryZoneTypes, eq(deliveryZoneTypes.zoneId, deliveryZones.id))
    .leftJoin(deliveryTypes, eq(deliveryTypes.id, deliveryZoneTypes.typeId));

  const byZoneId = new Map<bigint, ZoneWithTypes>();
  for (const row of rows) {
    let entry = byZoneId.get(row.zone.id);
    if (!entry) {
      entry = { ...rowToZone(row.zone), types: [] };
      byZoneId.set(row.zone.id, entry);
    }
    if (row.type) entry.types.push(rowToType(row.type));
  }
  return [...byZoneId.values()];
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

export async function saveDeliveryType(
  publicId: string | null,
  values: Record<string, unknown>,
): Promise<DeliveryType> {
  const row = publicId ? await typeService.update(publicId, values) : await typeService.create(values);
  return rowToType(row as unknown as TypeRow);
}

export async function retireDeliveryType(publicId: string): Promise<DeliveryType> {
  const row = await typeService.update(publicId, { active: false });
  return rowToType(row as unknown as TypeRow);
}

/**
 * Replaces a zone's offered types wholesale — the admin's checkbox state is
 * authoritative, so this deletes then re-inserts inside one transaction
 * rather than diffing.
 */
export async function setZoneTypes(zoneId: bigint, typeIds: bigint[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(deliveryZoneTypes).where(eq(deliveryZoneTypes.zoneId, zoneId));
    if (typeIds.length > 0) {
      await tx.insert(deliveryZoneTypes).values(typeIds.map((typeId) => ({ zoneId, typeId })));
    }
  });
}

/**
 * {@link setZoneTypes} keys on internal bigint ids; the admin UI only ever
 * holds public ids client-side, so the server action resolves through these
 * before calling it. `read()` throws NotFoundError on a bad public id.
 */
export async function resolveZoneId(publicId: string): Promise<bigint> {
  return (await zoneService.read(publicId)).id;
}

export async function resolveTypeIds(publicIds: string[]): Promise<bigint[]> {
  const rows = await Promise.all(publicIds.map((id) => typeService.read(id)));
  return rows.map((r) => r.id);
}

/** Type/zone labels for an order's delivery — resolves the FK ids the order row carries. */
export async function getDeliveryLabelsForOrder(
  typeId: bigint | null,
  zoneId: bigint | null,
): Promise<{ typeLabel: string | null; zoneName: string | null }> {
  const [typeRow] = typeId
    ? await db.select({ label: deliveryTypes.label }).from(deliveryTypes).where(eq(deliveryTypes.id, typeId)).limit(1)
    : [];
  const [zoneRow] = zoneId
    ? await db.select({ name: deliveryZones.name }).from(deliveryZones).where(eq(deliveryZones.id, zoneId)).limit(1)
    : [];
  return { typeLabel: typeRow?.label ?? null, zoneName: zoneRow?.name ?? null };
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
