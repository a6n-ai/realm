import { baseStatement, createAccessControl } from "@realm/auth";
import { Role } from "@realm/commons";

// Resource/action vocabulary for this app. `baseStatement` brings better-auth's own
// `user` and `session` resources (which the admin plugin's endpoints check) plus the
// shared CRM `settings` and `audit`.
export const statement = {
  ...baseStatement,
  // This app's own user-management actions. Deliberately NOT better-auth's `user`
  // resource: `user: ["ban"]` and `user: ["delete"]` are what authorize the plugin's
  // /admin/ban-user and /admin/remove-user endpoints, so gating our soft-delete on
  // them would hand out the hard delete alongside it.
  staff: ["invite", "suspend", "remove"],
  product: ["read", "write", "sync"],
  order: ["read", "write", "refund", "cancel"],
  finance: ["read"],
  clover: ["read", "connect"],
  organization: ["read", "write"],
} as const;

export const ac = createAccessControl(statement);

// Console permissions are staff-only. Role.USER (customers, who do sign in and use
// /me) is deliberately absent rather than empty: roleCan() then denies it by
// construction, so a new resource added below is never accidentally customer-visible.
export const roles = {
  admin: ac.newRole({
    // An explicit subset of adminAc.statements, NOT a spread of it. The admin plugin
    // mounts ban-user, unban-user, impersonate-user and remove-user unconditionally —
    // there is no config flag that omits them — and each authorizes against this map.
    // Spreading adminAc would make all four reachable over raw HTTP by any admin
    // session, which defeats two invariants this design rests on: users.status is the
    // only sign-in switch (better-auth's own sign-in check reads `banned`, a flag no
    // UI here shows or clears), and softDelete is the only delete (orders and payments
    // reference these rows).
    //
    // Granted: create + set-role (createUser needs both), list and get (read-only),
    // and the session endpoints. Omitted: ban, impersonate, impersonate-admins,
    // delete, set-password, set-email, update — none of which this app calls.
    user: ["create", "list", "get", "set-role"],
    session: ["list", "revoke", "delete"],
    staff: ["invite", "suspend", "remove"],
    settings: ["read", "write"],
    audit: ["read"],
    product: ["read", "write", "sync"],
    order: ["read", "write", "refund", "cancel"],
    finance: ["read"],
    clover: ["read", "connect"],
    organization: ["read", "write"],
  }),
  member: ac.newRole({
    product: ["read", "write"],
    order: ["read", "write"],
    finance: ["read"],
    audit: ["read"],
  }),
};

// Roles an admin may hand out from the invite dialog.
export const INVITABLE_ROLES = [Role.ADMIN, Role.MEMBER] as const;
