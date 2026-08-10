import { AuthError, ForbiddenError } from "@realm/commons";
import type { Role } from "better-auth/plugins/access";

type SessionUser = { role: string };
type GetSession = () => Promise<{ user?: SessionUser | null } | null | undefined>;
type Permissions = Record<string, string[]>;

/**
 * Permission guards for any client. Authorization runs LOCALLY against the role map:
 * the acting user's role is already on the session, so `auth.api.userHasPermission`
 * would add a request per check for an answer we can compute here.
 *
 * An unknown role denies. That matters more than it looks — a role present in the DB
 * but absent from the map (a stale value, a half-finished migration) must fail closed.
 */
export function createPermissionGuards(getSession: GetSession, roles: Record<string, Role>) {
  async function requireSession(): Promise<SessionUser> {
    const session = await getSession();
    if (!session?.user) throw new AuthError();
    return session.user;
  }

  function roleCan(role: string, permissions: Permissions): boolean {
    const r = roles[role];
    if (!r) return false;
    return r.authorize(permissions).success;
  }

  async function requirePermission(permissions: Permissions): Promise<void> {
    const user = await requireSession();
    if (!roleCan(user.role, permissions)) throw new ForbiddenError();
  }

  return { requireSession, requirePermission, roleCan };
}
