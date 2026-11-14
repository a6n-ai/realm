import { Role } from "@foundry/commons";
import { createPermissionGuards, createRoleGuards } from "@foundry/auth";
import { getSession } from "./session";
import { roles } from "./permissions";
import { isAdmin } from "@/lib/roles";

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

export async function AdminOnly({ children }: { children: React.ReactNode }) {
  return isAdmin(await getSession()) ? children : null;
}
