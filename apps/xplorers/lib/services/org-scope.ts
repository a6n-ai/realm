import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organization } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export async function resolveActingOrgId(): Promise<string | null> {
  const session = await getSession();
  if (session?.session.activeOrganizationId) return session.session.activeOrganizationId;

  const headerOrg = (await headers()).get("x-realm-org-id");
  if (headerOrg) return headerOrg;

  const [fallback] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.isDefaultLocation, true))
    .limit(1);
  return fallback?.id ?? null;
}

export type OrgScopeMode = { mode: "all" } | { mode: "org"; orgId: string };

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
