import { Role } from "@foundry/commons";
import { createPermissionGuards, createRoleGuards } from "@foundry/auth";
import { getSession } from "./session";
import { roles } from "./permissions";

const { requireRole } = createRoleGuards(getSession);
const { requirePermission, roleCan } = createPermissionGuards(getSession, roles);

export { requireRole, requirePermission, roleCan };

export function requireAdmin(): Promise<void> {
  return requireRole(Role.ADMIN);
}

export function requireStaff(): Promise<void> {
  return requireRole(Role.ADMIN, Role.MEMBER);
}
