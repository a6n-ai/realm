import { Role } from "@realm/commons";
import { createPermissionGuards, createRoleGuards } from "@realm/auth";
import { getSession } from "./session";
import { roles } from "./permissions";

const { requireRole } = createRoleGuards(getSession);
const { requirePermission, roleCan } = createPermissionGuards(getSession, roles);

export { requirePermission, roleCan };

// Kept as-is for the ~30 existing call sites. New code should state the permission
// it needs instead, so adding a role later is a change to permissions.ts alone.
export function requireAdmin(): Promise<void> {
  return requireRole(Role.ADMIN);
}
