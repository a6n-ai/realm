import { Role, type RoleValue } from "@foundry/commons";

type RoleLike = string | null | undefined;
type SessionLike = { user?: { role?: RoleLike } | null } | null | undefined;

export const STAFF_ROLES: RoleValue[] = [Role.ADMIN, Role.MEMBER];

export const ADMIN_ROLES: string[] = [Role.ADMIN];
export const ALL_ROLES: string[] = Object.values(Role);

export function isStaffRole(role: RoleLike): boolean {
  return role === Role.ADMIN || role === Role.MEMBER;
}

export function isCustomerRole(role: RoleLike): boolean {
  return role === Role.USER;
}

export function isAdmin(sessionOrRole: RoleLike | SessionLike): boolean {
  const role = typeof sessionOrRole === "object" && sessionOrRole !== null ? sessionOrRole.user?.role : sessionOrRole;
  return role === Role.ADMIN;
}
