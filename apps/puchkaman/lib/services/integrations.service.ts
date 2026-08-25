import { eq } from "drizzle-orm";
import {
  DEFAULT_INTEGRATIONS_CONFIG,
  parseIntegrationsConfig,
  resolveIntegrationsConfig,
  type IntegrationsConfig,
  type IntegrationsConfigStore,
} from "@realm/clover";
import { UpdatableRepository } from "@realm/database";
import { db } from "@/db/client";
import { app, organization } from "@/db/schema";
import { getSession } from "../auth/session";
import { SessionUpdatableService } from "./session-service";

const DEFAULTS = { timezone: "America/Toronto", currency: "CAD" } as const;

/**
 * App singleton service — extends {@link SessionUpdatableService} over
 * {@link UpdatableRepository} for the `app` row (same pattern as tiffin-grab).
 * `app` is in AUDIT_UPDATE_SKIP (token-bearing integrations_config); clover
 * install/connect/disconnect write explicit recordAudit summaries instead.
 */
class AppService extends SessionUpdatableService<typeof app> {}

const appRepository = new UpdatableRepository(db, app, app.publicId, app.id);
const appService = new AppService(appRepository);

/**
 * Resolves Clover config for the acting organization: the session's
 * `activeOrganizationId` if set, else the brand (`isDefaultLocation`) org —
 * which today is EVERY session, since no org-switcher UI exists yet to set
 * an active org. That makes this read path additive, not a behavior change:
 * with no switcher, resolution always falls through to the brand org, same
 * as today's direct `app.integrationsConfig` read.
 *
 * `setIntegrationsConfig` below is unchanged and still writes to `app` —
 * out of scope until an org-switcher UI exists to say which org a write
 * should target (see docs/superpowers/plans/2026-08-25-puchkaman-org-hierarchy.md).
 */
export async function getIntegrationsConfig(): Promise<IntegrationsConfig> {
  const session = await getSession();
  const activeOrgId = session?.session.activeOrganizationId ?? null;

  const [activeOrg] = activeOrgId
    ? await db.select().from(organization).where(eq(organization.id, activeOrgId)).limit(1)
    : [];

  const [defaultOrg] = await db.select().from(organization).where(eq(organization.isDefaultLocation, true)).limit(1);

  const org = activeOrg ?? defaultOrg;
  if (!org) return DEFAULT_INTEGRATIONS_CONFIG;

  const [parent] = org.parentOrganizationId
    ? await db.select().from(organization).where(eq(organization.id, org.parentOrganizationId)).limit(1)
    : [];

  return resolveIntegrationsConfig(org, parent ?? null);
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
