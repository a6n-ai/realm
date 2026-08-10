import { baseStatement, createAccessControl } from "@realm/auth";
import { Role } from "@realm/commons";

export const statement = {
  ...baseStatement,
  // This app's own user-management actions — see the same comment in puchkaman's
  // permissions.ts. Gating them on better-auth's `user` resource would also authorize
  // the plugin's ban/impersonate/remove endpoints, which are mounted unconditionally.
  staff: ["invite", "suspend", "remove"],
  order: ["read", "write", "cancel"],
  subscription: ["read", "write", "pause"],
  menu: ["read", "write", "publish"],
  finance: ["read"],
} as const;

export const ac = createAccessControl(statement);

// Unlike puchkaman, `user` exists here — checkout provisions customer accounts. It
// holds no dashboard permissions; it is the role a customer carries.
export const roles = {
  admin: ac.newRole({
    // An explicit subset, NOT a spread of adminAc.statements. See puchkaman's
    // permissions.ts for why: ban / impersonate / delete authorize plugin endpoints
    // this app does not mount, and granting them would bypass users.status and
    // usersService.softDelete over raw HTTP.
    //
    // `list` and `get` are withheld too, unlike puchkaman. They authorize
    // /admin/list-users and /admin/get-user, and this is the CUSTOMER origin — that
    // endpoint would page through every customer's PII without touching audit_log.
    // Nothing here needs them: the users page queries the database directly, so the
    // only effect of granting them would be an unaudited read channel.
    user: ["create", "set-role"],
    session: ["list", "revoke", "delete"],
    staff: ["invite", "suspend", "remove"],
    settings: ["read", "write"],
    audit: ["read"],
    order: ["read", "write", "cancel"],
    subscription: ["read", "write", "pause"],
    menu: ["read", "write", "publish"],
    finance: ["read"],
  }),
  member: ac.newRole({
    order: ["read", "write"],
    subscription: ["read", "write", "pause"],
    menu: ["read"],
    finance: ["read"],
  }),
  user: ac.newRole({}),
};

// Staff only. A customer account is created by checkout, never by an admin typing an
// email, so Role.USER is not offered even though the role exists.
export const INVITABLE_ROLES = [Role.ADMIN, Role.MEMBER] as const;
