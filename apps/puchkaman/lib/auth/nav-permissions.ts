import type { RoleValue } from "@realm/commons";
import { roleCan } from "./guards";

/**
 * Every permission the nav can gate on, as flat "resource:action" strings.
 *
 * The nav components are client components, and permissions.ts pulls in
 * server-only @realm/auth, so the browser can never evaluate roleCan itself.
 * The server resolves the role to this plain list and the client filters by
 * string membership — data crosses the boundary, code does not.
 */
const NAV_PERMISSIONS: Array<[string, Record<string, string[]>]> = [
  ["order:read", { order: ["read"] }],
  ["product:read", { product: ["read"] }],
  ["finance:read", { finance: ["read"] }],
  ["settings:read", { settings: ["read"] }],
  ["audit:read", { audit: ["read"] }],
  ["clover:read", { clover: ["read"] }],
  ["user:list", { user: ["list"] }],
  // Not nav destinations — product write/sync controls (edit, delete, Clover
  // sync buttons) reuse this same granted-strings crossing for the identical
  // client-component-can't-import-@realm/auth reason.
  ["product:write", { product: ["write"] }],
  ["product:sync", { product: ["sync"] }],
];

export function grantedKeys(role: RoleValue): string[] {
  return NAV_PERMISSIONS.filter(([, p]) => roleCan(role, p as never)).map(([key]) => key);
}
