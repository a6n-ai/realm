import { Role } from "@foundry/commons";
import { createOrgPermissionGuards, createPermissionGuards, createRoleGuards } from "@foundry/auth";
import { getSession } from "./session";
import { getOrgAccess } from "./org-access";
import { recordAudit } from "@/lib/identity/audit";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { roles } from "./permissions";
import { isAdmin } from "@/lib/roles";

const { requireRole } = createRoleGuards(getSession);
// Deprecated with requireStaff/requireAdmin: Task 11 moves call sites to can().
const { roleCan } = createPermissionGuards(getSession, roles);

export const { can, requirePermission } = createOrgPermissionGuards({
  getAccess: getOrgAccess,
  onPlatformBypass: async (userId, perms) =>
    recordAudit({
      entity: "auth",
      entityPublicId: userId,
      operation: "update",
      changes: { _action: "platform_bypass", perms },
      createdBy: (await userIdByPublicId(userId)) ?? null,
    }),
});

export { requireRole, roleCan };

// App-specific role groupings: what "admin"/"staff" mean for this client. New code should state the
// permission it needs.
/** @deprecated use requirePermission */
export function requireAdmin(): Promise<void> {
  return requireRole(Role.ADMIN);
}

/** @deprecated use requirePermission */
export function requireStaff(): Promise<void> {
  return requireRole(Role.ADMIN, Role.MEMBER);
}

export async function AdminOnly({ children }: { children: React.ReactNode }) {
  return isAdmin(await getSession()) ? children : null;
}
