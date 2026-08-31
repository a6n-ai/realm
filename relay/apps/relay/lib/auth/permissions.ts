import { baseStatement, createAccessControl } from "@foundry/auth";

export const statement = {
  ...baseStatement,
  tenant: ["read", "write"],
  message: ["read", "write"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  admin: ac.newRole({
    user: ["create", "set-role"],
    session: ["list", "revoke", "delete"],
    settings: ["read", "write"],
    audit: ["read"],
    tenant: ["read", "write"],
    message: ["read", "write"],
  }),
};
