import { Role } from "@realm/commons";
import { createPermissionGuards, createRoleGuards } from "@realm/auth";
import { getSession } from "./session";
import { roles } from "./permissions";

const { requireRole } = createRoleGuards(getSession);
const { requirePermission, roleCan } = createPermissionGuards(getSession, roles);

export { requireRole, requirePermission, roleCan };

// App-specific role groupings: what "admin"/"staff" mean for this client. Kept for the
// existing call sites; new code should state the permission it needs.
export function requireAdmin(): Promise<void> {
  return requireRole(Role.ADMIN);
}

export function requireStaff(): Promise<void> {
  return requireRole(Role.ADMIN, Role.MEMBER);
}
