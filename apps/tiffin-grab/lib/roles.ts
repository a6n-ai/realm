import { Role, type RoleValue } from "@foundry/commons";

type RoleLike = string | null | undefined;

export const STAFF_ROLES: RoleValue[] = [Role.ADMIN, Role.MEMBER];

export const ALL_ROLES: string[] = Object.values(Role);

export function isStaffRole(role: RoleLike): boolean {
  return role === Role.ADMIN || role === Role.MEMBER;
}

export function isCustomerRole(role: RoleLike): boolean {
  return role === Role.USER;
}
