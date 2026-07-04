import { AuthError, ForbiddenError, type RoleValue } from "@realm/commons";

type SessionUser = { role: RoleValue };
type GetSession = () => Promise<{ user?: SessionUser | null } | null | undefined>;

// Role-based route guards for any client. Inject the app's getSession; the
// role→access policy (what counts as admin/staff) stays with the app, which
// composes requireRole into its own named guards. Throws commons AuthError
// (unauthenticated) / ForbiddenError (wrong role).
export function createRoleGuards(getSession: GetSession) {
  async function requireSession(): Promise<SessionUser> {
    const session = await getSession();
    if (!session?.user) throw new AuthError();
    return session.user;
  }
  async function requireRole(...roles: RoleValue[]): Promise<void> {
    const user = await requireSession();
    if (!roles.includes(user.role)) throw new ForbiddenError();
  }
  return { requireSession, requireRole };
}
