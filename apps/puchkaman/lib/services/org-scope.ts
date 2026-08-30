import { isNull, or, eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { organization } from "@/db/schema";
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
 * to an all-franchises-with-a-clientCode-column view when the active org IS
 * the brand itself (parentOrganizationId null) — a brand admin manages every
 * location, so scoping them to "brand + null rows" the same way a franchise
 * session would be would just hide every franchise's rows outright.
 */
export async function resolveOrgScopeMode(): Promise<OrgScopeMode> {
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
