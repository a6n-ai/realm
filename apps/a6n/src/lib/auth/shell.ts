import { getDb } from "../../db/client";
import type { Env } from "../../env";
import { unassignedCounts } from "../inquiries/repository";
import { listMemberships, resolveMembership } from "./membership";
import type { Permission } from "./permissions";
import { getSession, type SessionUser } from "./session";

export { safeRedirect } from "./redirect";

export type Shell = {
  user: SessionUser;
  organization: { id: string; name: string } | null;
  organizations: { id: string; name: string }[];
  role: string | null;
  permissions: Permission[];
  platformAdmin: boolean;
  unassigned: { total: number; overdue: number };
};

export async function loadShell(env: Env, headers: Headers): Promise<Shell | null> {
  const user = await getSession(env, headers);
  if (!user) return null;
  const db = getDb(env);
  const m = await resolveMembership(db, user.id, user.activeOrganizationId);
  const organizations = (await listMemberships(db, user.id)).map((o) => ({ id: o.organizationId, name: o.organizationName }));
  return {
    user,
    organization: m ? { id: m.organizationId, name: m.organizationName } : null,
    organizations,
    role: m?.role ?? null,
    permissions: m?.permissions ?? [],
    platformAdmin: user.platformRole === "super_admin",
    unassigned: m ? await unassignedCounts(db) : { total: 0, overdue: 0 },
  };
}
