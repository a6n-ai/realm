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
  ["organization:read", { organization: ["read"] }],
  ["user:list", { user: ["list"] }],
  // Not nav destinations — product write/sync controls (edit, delete, Clover
  // sync buttons) reuse this same granted-strings crossing for the identical
  // client-component-can't-import-@realm/auth reason.
  ["product:write", { product: ["write"] }],
  ["product:sync", { product: ["sync"] }],
  // Nav-only, admin-exclusive gate for the Settings hub, Delivery, and
  // Integrations sidebar links. `settings:read` alone can't gate these: the
  // member-permission audit widened it so member reaches the google-reviews
  // settings sub-page, but the hub page itself and these two sibling pages
  // still call requireAdmin() (deliberately, per that plan's own out-of-scope
  // list), so a member with only settings:read would see a live link that
  // ForbiddenError()s on click. `staff:invite` is admin-only today and isn't
  // this destination's real requirement either, same reuse-an-admin-only-key
  // pattern as product:sync above — swap it for a real "settings:admin"
  // action if that resource is ever split.
  ["settings:hub", { staff: ["invite"] }],
];

export function grantedKeys(role: RoleValue): string[] {
  return NAV_PERMISSIONS.filter(([, p]) => roleCan(role, p as never)).map(([key]) => key);
}
