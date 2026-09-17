import type { RoleValue } from "@foundry/commons";
import { roleCan } from "./guards";

const NAV_PERMISSIONS: Array<[string, Record<string, string[]>]> = [
  ["settings:read", { settings: ["read"] }],
  ["audit:read", { audit: ["read"] }],
  ["organization:read", { organization: ["read"] }],
  ["user:list", { user: ["list"] }],
  ["staff:invite", { staff: ["invite"] }],
  ["studioSession:read", { studioSession: ["read"] }],
  ["studioSession:create", { studioSession: ["create"] }],
  ["studioSession:update", { studioSession: ["update"] }],
  ["booking:read", { booking: ["read"] }],
];

export function grantedKeys(role: RoleValue): string[] {
  return NAV_PERMISSIONS.filter(([, p]) => roleCan(role, p as never)).map(([key]) => key);
}
