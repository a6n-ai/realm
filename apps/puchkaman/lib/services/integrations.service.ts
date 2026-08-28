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
import { resolveRequestOrg } from "../tenant/resolve-request-org";
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
 * Resolves the acting organization: the session's `activeOrganizationId`
 * (staff, set via the header OrgSwitcher) if set, else the franchise
 * proxy.ts resolved from the request (public visitor — URL segment/
 * `franchise` cookie; null on /dashboard, so this never overrides a staff
 * session), else the brand (`isDefaultLocation`) org.
 */
async function resolveActingOrg() {
  const session = await getSession();
  const activeOrgId = session?.session?.activeOrganizationId ?? (await resolveRequestOrg());

  const [activeOrg] = activeOrgId
    ? await db.select().from(organization).where(eq(organization.id, activeOrgId)).limit(1)
    : [];
  if (activeOrg) return activeOrg;

  const [defaultOrg] = await db.select().from(organization).where(eq(organization.isDefaultLocation, true)).limit(1);
  return defaultOrg ?? null;
}

/**
 * Resolves Clover config for the acting organization (see {@link resolveActingOrg}).
 * With no org-switcher UI yet, resolution always falls through to the brand
 * org, same as today's direct `app.integrationsConfig` read used to be —
 * kept in sync by {@link setIntegrationsConfig} writing to both rows below.
 *
 * If no organization row resolves at all (fresh migration before
 * `db/seed-brand-org.ts` has been run — that script is a manual invocation,
 * not wired into deploy), fall back to reading `app` directly so Clover
 * doesn't silently read as uninstalled during that window.
 */
export async function getIntegrationsConfig(): Promise<IntegrationsConfig> {
  const org = await resolveActingOrg();
  if (!org) {
    const [row] = await db.select({ cfg: app.integrationsConfig }).from(app).limit(1);
    return parseIntegrationsConfig(row?.cfg ?? undefined);
  }

  const [parent] = org.parentOrganizationId
    ? await db.select().from(organization).where(eq(organization.id, org.parentOrganizationId)).limit(1)
    : [];

  return resolveIntegrationsConfig(org, parent ?? null);
}

/**
 * Writes to both `app` and the resolved acting organization's row. The `app`
 * write is the source `getIntegrationsConfig` falls back to when no
 * organization row resolves at all (see the no-org branch there) — not
 * legacy dead weight. Now that the OrgSwitcher and per-franchise Clover
 * connections are both real, this dual-write IS a last-writer-wins hazard
 * across franchises (Toronto connecting Clover overwrites the same `app`
 * fallback row Vancouver's connect also writes) — not fixed here, flagging
 * for whoever picks up admin-side multi-franchise Clover settings next.
 * No transaction: these are two
 * independent singleton/tenant rows, not a multi-row invariant — a partial
 * write here is no worse than today's single-row write racing a concurrent
 * read, and wrapping unrelated tables in one transaction buys nothing but
 * broader lock scope.
 */
export async function setIntegrationsConfig(cfg: IntegrationsConfig): Promise<void> {
  const parsed = parseIntegrationsConfig(cfg);
  const [row] = await db.select({ publicId: app.publicId }).from(app).limit(1);
  if (row) {
    await appService.update(row.publicId, { integrationsConfig: parsed });
  } else {
    await appService.create({ ...DEFAULTS, integrationsConfig: parsed });
  }

  const org = await resolveActingOrg();
  if (org) {
    await db.update(organization).set({ integrationsConfig: parsed }).where(eq(organization.id, org.id));
  }
}

export const integrationsConfigStore: IntegrationsConfigStore = {
  get: getIntegrationsConfig,
  set: setIntegrationsConfig,
};

// Which franchise's Clover connection is in effect right now (see
// resolveActingOrg) — used to stamp organizationId on rows a Clover sync
// creates, so a product pulled via Toronto's connection is attributed to
// Toronto, not left null/shared.
export async function resolveActingOrgId(): Promise<string | null> {
  const org = await resolveActingOrg();
  return org?.id ?? null;
}
