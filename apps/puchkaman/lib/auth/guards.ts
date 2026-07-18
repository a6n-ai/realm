import { Role } from "@realm/commons";
import { createRoleGuards } from "@realm/auth";
import { getSession } from "./session";

const { requireRole } = createRoleGuards(getSession);

export function requireAdmin(): Promise<void> {
  return requireRole(Role.ADMIN);
}
