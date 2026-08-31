import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

// Resources every Realm CRM has. App-specific resources (product, order, …) are
// added by each app's own permissions.ts, which spreads this in.
export const crmStatements = {
  settings: ["read", "write"],
  audit: ["read"],
} as const;

// defaultStatements carries better-auth's own `user` and `session` resources, which
// the admin plugin's endpoints check against. Dropping them would leave createUser
// and setRole permanently forbidden.
export const baseStatement = { ...defaultStatements, ...crmStatements } as const;

export { createAccessControl, adminAc, defaultStatements };
export type { Role } from "better-auth/plugins/access";
