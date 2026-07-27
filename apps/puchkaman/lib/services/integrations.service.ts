import {
  parseIntegrationsConfig,
  type IntegrationsConfig,
  type IntegrationsConfigStore,
} from "@realm/clover";
import { UpdatableRepository, UpdatableService } from "@realm/database";
import { db } from "@/db/client";
import { app } from "@/db/schema";

const DEFAULTS = { timezone: "America/Toronto", currency: "CAD" } as const;

/**
 * App singleton service — extends {@link UpdatableService} over
 * {@link UpdatableRepository} for the `app` row (same pattern as tiffin-grab).
 */
class AppService extends UpdatableService<typeof app> {}

const appRepository = new UpdatableRepository(db, app, app.publicId, app.id);
const appService = new AppService(appRepository);

/**
 * Single-row integrations blob on `app` — same persistence shape as
 * tiffin-grab's payment_config / integrations_config (JSONB on the tenant singleton).
 * Writes go through {@link AppService} → {@link UpdatableRepository}.
 */
export async function getIntegrationsConfig(): Promise<IntegrationsConfig> {
  const [row] = await db.select({ cfg: app.integrationsConfig }).from(app).limit(1);
  return parseIntegrationsConfig(row?.cfg ?? undefined);
}

export async function setIntegrationsConfig(cfg: IntegrationsConfig): Promise<void> {
  const parsed = parseIntegrationsConfig(cfg);
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) {
    await appService.update(row.publicId, { integrationsConfig: parsed });
  } else {
    await appService.create({ ...DEFAULTS, integrationsConfig: parsed });
  }
}

export const integrationsConfigStore: IntegrationsConfigStore = {
  get: getIntegrationsConfig,
  set: setIntegrationsConfig,
};
