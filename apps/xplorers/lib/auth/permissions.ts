import { baseStatement, createAccessControl } from "@foundry/auth";
import { Role } from "@foundry/commons";

export const statement = {
  ...baseStatement,
  staff: ["invite", "suspend", "remove"],
  organization: ["read", "write"],
  studioSession: ["create", "read", "update", "delete"],
  booking: ["create", "read"],
  discount: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  admin: ac.newRole({
    user: ["create", "list", "get", "set-role"],
    session: ["list", "revoke", "delete"],
    staff: ["invite", "suspend", "remove"],
    settings: ["read", "write"],
    audit: ["read"],
    organization: ["read", "write"],
    studioSession: ["create", "read", "update", "delete"],
    booking: ["read"],
    discount: ["create", "read", "update", "delete"],
  }),
  member: ac.newRole({
    settings: ["read"],
    audit: ["read"],
    organization: ["read"],
    studioSession: ["read"],
    booking: ["read"],
    discount: ["read"],
  }),
};

export const INVITABLE_ROLES = [Role.ADMIN, Role.MEMBER] as const;
