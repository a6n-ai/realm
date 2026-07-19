import { Role, type RoleValue } from "@realm/commons";

// Staff = admin or member (mirrors requireStaff in guards.ts). Non-throwing so
// pages can branch on it rather than guard.
export function isStaffRole(role: RoleValue): boolean {
  return role === Role.ADMIN || role === Role.MEMBER;
}

// Where a signed-in user of this role belongs: staff → ops dashboard, customers
// → their account home. Used to skip the login form for an already-authed visitor
// and to keep staff out of the customer subscribe flow.
export function roleLanding(role: RoleValue): string {
  return isStaffRole(role) ? "/dashboard" : "/me";
}
