import { Role } from "@foundry/commons";
import { createPermissionGuards, createRoleGuards } from "@foundry/auth";
import { getSession } from "./session";
import { roles } from "./permissions";

const { requireRole } = createRoleGuards(getSession);
const { requirePermission } = createPermissionGuards(getSession, roles);

export { requireRole, requirePermission };

export function requireAdmin(): Promise<void> {
  return requireRole(Role.ADMIN);
}
