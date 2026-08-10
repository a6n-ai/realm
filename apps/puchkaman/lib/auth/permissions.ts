import { adminAc, baseStatement, createAccessControl } from "@realm/auth";
import { Role } from "@realm/commons";

// Resource/action vocabulary for this app. `baseStatement` brings better-auth's own
// `user` and `session` resources (which the admin plugin's endpoints check) plus the
// shared CRM `settings` and `audit`.
export const statement = {
  ...baseStatement,
  product: ["read", "write", "sync"],
  order: ["read", "write", "refund", "cancel"],
  finance: ["read"],
  clover: ["read", "connect"],
} as const;

export const ac = createAccessControl(statement);

// Staff only: puchkaman never provisions a customer account, so Role.USER has no
// entry here and roleCan() denies it by construction.
export const roles = {
  admin: ac.newRole({
    ...adminAc.statements,
    settings: ["read", "write"],
    audit: ["read"],
    product: ["read", "write", "sync"],
    order: ["read", "write", "refund", "cancel"],
    finance: ["read"],
    clover: ["read", "connect"],
  }),
  member: ac.newRole({
    product: ["read"],
    order: ["read", "write"],
    finance: ["read"],
  }),
};

// Roles an admin may hand out from the invite dialog.
export const INVITABLE_ROLES = [Role.ADMIN, Role.MEMBER] as const;
