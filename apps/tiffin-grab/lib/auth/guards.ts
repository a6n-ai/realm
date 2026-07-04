import { Role } from "@realm/commons";
import { createRoleGuards } from "@realm/auth";
import { getSession } from "./session";

const { requireRole } = createRoleGuards(getSession);

export { requireRole };

// App-specific role groupings: what "admin"/"staff" mean for this client.
export function requireAdmin(): Promise<void> {
  return requireRole(Role.ADMIN);
}

export function requireStaff(): Promise<void> {
  return requireRole(Role.ADMIN, Role.MEMBER);
}
