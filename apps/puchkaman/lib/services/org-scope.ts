import { isNull, or, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { organization } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { resolveActingOrgId } from "@/lib/services/integrations.service";

/**
 * The one place every org-scoped list/query in this app resolves "which
 * franchise is this request for" and turns it into a WHERE condition. Reuse
 * this everywhere a repository or service lists rows from a table with an
 * organizationId column — don't hand-roll the isNull/eq pair per call site.
 *
 * `activeOrgId` is resolved once per request via resolveActingOrgId()
 * (session.activeOrganizationId for a logged-in staff session, otherwise the
 * `franchise` cookie/URL segment proxy.ts already resolved) — same source
 * the org switcher and public menu already key off. A null org (no session,
 * no resolvable request) returns `undefined`, i.e. no filter — callers that
 * need a hard requirement should check resolveActingOrgId()'s result
 * themselves before calling.
 */
export async function orgScopeWhere(organizationIdColumn: PgColumn): Promise<SQL | undefined> {
  const orgId = await resolveActingOrgId();
  return orgId ? or(isNull(organizationIdColumn), eq(organizationIdColumn, orgId)) : undefined;
}

export type OrgScopeMode = { mode: "all" } | { mode: "org"; orgId: string };

/**
 * Same "which franchise" resolution as orgScopeWhere, but for admin listings
 * that show a franchise-scoped view by default (Orders, Finance) and switch
 * to an all-franchises-with-a-clientCode-column view when either:
 *   - the session's platformRole is "super_admin" — a person-level bypass
 *     (see @realm/auth resolveVisibleOrgIds), independent of which org is
 *     active. This is the ONLY thing that sees across every brand once a
 *     second one exists; ordinary staff never get it regardless of org.
 *   - the active org IS a brand itself (parentOrganizationId null) — a brand
 *     admin manages every location under it, so scoping them to "brand + null
 *     rows" the same way a franchise session would be would just hide every
 *     franchise's rows outright.
 */
export async function resolveOrgScopeMode(): Promise<OrgScopeMode> {
  const session = await getSession();
  if (session?.user.platformRole === "super_admin") return { mode: "all" };

  const orgId = await resolveActingOrgId();
  if (!orgId) return { mode: "all" };
  const [org] = await db
    .select({ parentOrganizationId: organization.parentOrganizationId })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org || org.parentOrganizationId === null) return { mode: "all" };
  return { mode: "org", orgId };
}

/**
 * Drop-in replacement for orgScopeWhere in admin listings: `undefined` (no
 * filter) in "all" mode instead of an isNull/eq pair keyed to one org id —
 * the bug orgScopeWhere has for a brand admin is that "all" only shows
 * organizationId IS NULL OR = <brand's own id>, which hides every franchise's
 * rows (they carry the franchise's id, not the brand's). Sync/dedupe lookups
 * should keep using orgScopeWhere/this.scope() directly — this one is only
 * for what an admin's listing page renders.
 */
export async function orgScopeWhereForAdmin(organizationIdColumn: PgColumn): Promise<SQL | undefined> {
  const scopeMode = await resolveOrgScopeMode();
  if (scopeMode.mode === "all") return undefined;
  return or(isNull(organizationIdColumn), eq(organizationIdColumn, scopeMode.orgId));
}
