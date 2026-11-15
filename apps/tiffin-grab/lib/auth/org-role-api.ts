import { APIError } from "better-auth/api";
import { ValidationError } from "@foundry/commons";
import type { Permissions } from "@foundry/auth";
import { auth } from "./index";

export type OrgRoleRecord = { id: string; role: string; permission: Permissions; organizationId: string };

// createOrganizationPlugin's return type drops the dynamic-access-control endpoints; they are mounted at runtime.
type OrgRoleEndpoints = {
  createOrgRole(ctx: { headers: Headers; body: { role: string; permission: Permissions; organizationId?: string } }): Promise<{ roleData: OrgRoleRecord }>;
  updateOrgRole(ctx: {
    headers: Headers;
    body: { roleId: string; organizationId?: string; data: { roleName?: string; permission?: Permissions } };
  }): Promise<unknown>;
  deleteOrgRole(ctx: { headers: Headers; body: { roleId: string; organizationId?: string } }): Promise<unknown>;
};

export const orgRoleApi = auth.api as unknown as OrgRoleEndpoints;

/** Better Auth refusals (grant beyond your own rights, unknown role...) become action errors, not thrown server errors. */
export async function authApi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof APIError) throw new ValidationError(e.message || "Request refused.");
    throw e;
  }
}
