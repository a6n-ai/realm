import type { RoleValue } from "@foundry/commons";
import { isStaffRole } from "./roles";

// Where a signed-in user of this role belongs: staff → ops dashboard, customers
// → their account home. Used to skip the login form for an already-authed visitor
// and to keep staff out of the customer subscribe flow.
export function roleLanding(role: RoleValue): string {
  return isStaffRole(role) ? "/dashboard" : "/me";
}
