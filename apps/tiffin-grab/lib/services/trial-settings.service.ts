import { and, eq, isNull } from "drizzle-orm";
import { UpdatableRepository } from "@foundry/database";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { deliveryFrequencies, trialSettings } from "@/db/schema";
import { orderDeliveryDays, type DayOfWeek } from "@/lib/menu/delivery-days";
import { assertTrialMax, type TrialSettings } from "@/lib/trial/schedule";
import { SessionUpdatableService } from "./session-service";

class TrialSettingsService extends SessionUpdatableService<typeof trialSettings> {}

const trialSettingsEntity = new TrialSettingsService(
  new UpdatableRepository(db, trialSettings, trialSettings.publicId, trialSettings.id),
);

// Exact match like @foundry/delivery's per-org config: null org is the app-wide row.
const forOrg = (orgId?: string | null) =>
  orgId ? eq(trialSettings.organizationId, orgId) : isNull(trialSettings.organizationId);

const OFF: TrialSettings = { frequencyKey: null, weekdays: [], maxDays: null };

const frequencyDays = (f: { key: string; weekdays: string[] | null }) =>
  orderDeliveryDays({ frequencyKey: f.key, weekdays: f.weekdays as DayOfWeek[] | null, includeSaturday: false, includeSunday: false });

export async function getTrialSettings(orgId?: string | null): Promise<TrialSettings> {
  const [row] = await db
    .select({ maxDays: trialSettings.maxDays, key: deliveryFrequencies.key, weekdays: deliveryFrequencies.weekdays, active: deliveryFrequencies.active })
    .from(trialSettings)
    .leftJoin(deliveryFrequencies, eq(deliveryFrequencies.id, trialSettings.deliveryFrequencyId))
    .where(forOrg(orgId))
    .limit(1);
  if (!row?.key || !row.active || row.maxDays == null) return OFF;
  return { frequencyKey: row.key, weekdays: frequencyDays({ key: row.key, weekdays: row.weekdays }), maxDays: row.maxDays };
}

/** Both null turns trials off. */
export async function setTrialSettings(input: { frequencyKey: string | null; maxDays: number | null }, orgId?: string | null): Promise<void> {
  let values: { deliveryFrequencyId: bigint | null; maxDays: number | null } = { deliveryFrequencyId: null, maxDays: null };
  if (input.frequencyKey != null && input.maxDays != null) {
    const [f] = await db.select({ id: deliveryFrequencies.id, key: deliveryFrequencies.key, weekdays: deliveryFrequencies.weekdays })
      .from(deliveryFrequencies)
      .where(and(eq(deliveryFrequencies.key, input.frequencyKey), eq(deliveryFrequencies.active, true)))
      .limit(1);
    if (!f) throw new ValidationError("Pick an active delivery frequency");
    assertTrialMax(input.maxDays, frequencyDays(f));
    values = { deliveryFrequencyId: f.id, maxDays: input.maxDays };
  }
  const [row] = await db.select({ publicId: trialSettings.publicId }).from(trialSettings).where(forOrg(orgId)).limit(1);
  if (row) await trialSettingsEntity.update(row.publicId, values);
  else await trialSettingsEntity.create({ ...values, organizationId: orgId ?? null });
}
