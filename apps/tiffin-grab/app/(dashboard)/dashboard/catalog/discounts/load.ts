import { asc, desc } from "drizzle-orm";
import { zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { deliveryFrequencies, discounts, durationPackages } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import type { DiscountDto } from "./build-rows";

export async function loadDiscountData() {
  const [{ timezone }, freqs, durs, dRows] = await Promise.all([
    getAppSettings(),
    db.select({ id: deliveryFrequencies.id, publicId: deliveryFrequencies.publicId, name: deliveryFrequencies.name }).from(deliveryFrequencies),
    db.select({ id: durationPackages.id, publicId: durationPackages.publicId, weeks: durationPackages.weeks }).from(durationPackages).orderBy(asc(durationPackages.weeks)),
    db.select().from(discounts).orderBy(asc(discounts.kind), desc(discounts.createdAt)),
  ]);
  const publicById = new Map<bigint, string>([...freqs, ...durs].map((t) => [t.id, t.publicId]));
  const dtos: DiscountDto[] = dRows.map((d) => ({
    publicId: d.publicId,
    name: d.name,
    kind: d.kind,
    targetPublicId: d.targetId == null ? null : (publicById.get(d.targetId) ?? null),
    percent: Number(d.percent),
    minWeeks: d.minWeeks,
    startsAt: d.startsAt == null ? "" : zonedDateIso(Number(d.startsAt), timezone),
    endsAt: d.endsAt == null ? "" : zonedDateIso(Number(d.endsAt), timezone),
    active: d.active,
    startsAtMs: d.startsAt == null ? null : Number(d.startsAt),
    endsAtMs: d.endsAt == null ? null : Number(d.endsAt),
  }));
  return { freqs, durs, dtos };
}
