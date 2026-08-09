"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import {
  getZonesWithTypes,
  resolveTypeIds,
  resolveZoneId,
  retireZone,
  saveStoreOrigin,
  saveZone,
  setZoneTypes,
} from "@/lib/delivery/zones.service";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

// Minimum separation kept between two active zone radii — enough that a
// drag or a typed edit can never make two rings share (or cross) a boundary,
// which would otherwise blur which types `availableTypes` offers there.
const RING_GAP_KM = 0.01;

const zoneSchema = z.object({
  publicId: z.string().nullable(),
  name: z.string().trim().min(1, "Name is required"),
  radiusKm: z.number().positive("Must be greater than 0"),
  active: z.boolean(),
});

export type ZoneFormValues = z.input<typeof zoneSchema>;

function revalidate() {
  revalidatePath("/dashboard/settings/delivery/zones");
  revalidatePath("/dashboard/settings/delivery/options");
}

/**
 * Clamps `radiusKm` between the next-smaller and next-larger *other* active
 * zone so a save (from the number input or a map drag) can never reorder or
 * overlap rings. This is the authoritative enforcement — the client mirrors
 * it for live feedback, but a crafted request still can't cross a neighbour.
 */
async function clampRadius(radiusKm: number, excludePublicId: string | null): Promise<number> {
  const others = (await getZonesWithTypes()).filter(
    (z) => z.active && z.publicId !== excludePublicId,
  );
  const smaller = others.map((z) => z.radiusKm).filter((r) => r < radiusKm);
  const larger = others.map((z) => z.radiusKm).filter((r) => r > radiusKm);
  const lower = smaller.length ? Math.max(...smaller) + RING_GAP_KM : RING_GAP_KM;
  const upper = larger.length ? Math.min(...larger) - RING_GAP_KM : Infinity;
  return Math.min(Math.max(radiusKm, lower), Math.max(lower, upper));
}

export async function saveZoneAction(
  values: ZoneFormValues,
): Promise<{ error?: string; radiusKm?: number; publicId?: string }> {
  await requireAdmin();
  const parsed = zoneSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  const radiusKm = v.active ? await clampRadius(v.radiusKm, v.publicId) : v.radiusKm;

  try {
    // saveZone routes through SessionUpdatableService.create/update, which
    // already writes an audit row with a real before/after diff.
    const zone = await saveZone(v.publicId, { name: v.name, radiusKm, active: v.active });
    revalidate();
    return { radiusKm, publicId: zone.publicId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function retireZoneAction(publicId: string): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    await retireZone(publicId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Retire failed" };
  }
  // retireZone also routes through the service's auto-audited update.
  revalidate();
  return {};
}

export async function setZoneTypesAction(
  zonePublicId: string,
  typePublicIds: string[],
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    const [zoneId, typeIds] = await Promise.all([
      resolveZoneId(zonePublicId),
      resolveTypeIds(typePublicIds),
    ]);
    await setZoneTypes(zoneId, typeIds);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Save failed" };
  }
  await recordAudit({
    entity: "delivery_zone_types",
    entityPublicId: zonePublicId,
    operation: "update",
    changes: { typePublicIds },
    createdBy: await currentUserId(),
  });
  revalidate();
  return {};
}

export async function saveStoreOriginAction(
  lat: number,
  lng: number,
): Promise<{ error?: string }> {
  await requireAdmin();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "Invalid coordinates" };
  }
  // saveStoreOrigin routes through SessionUpdatableService.create/update, which
  // already writes an audit row with a real before/after diff.
  await saveStoreOrigin(lat, lng);
  revalidate();
  return {};
}
