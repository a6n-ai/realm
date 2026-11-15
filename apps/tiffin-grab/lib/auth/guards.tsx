import { AuthError, ForbiddenError } from "@foundry/commons";
import { createOrgPermissionGuards } from "@foundry/auth";
import { getSession } from "./session";
import { getOrgAccess, getOrgAccessFor } from "./org-access";
import { orgRoles } from "./permissions";
import { recordAudit } from "@/lib/identity/audit";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { isStaffRole } from "@/lib/roles";

const onPlatformBypass = async (userId: string, perms: Record<string, string[]>) =>
  recordAudit({
    entity: "auth",
    entityPublicId: userId,
    operation: "update",
    changes: { _action: "platform_bypass", perms },
    createdBy: (await userIdByPublicId(userId)) ?? null,
  });

export const { can, requirePermission } = createOrgPermissionGuards({ getAccess: getOrgAccess, onPlatformBypass });

const guardsFor = (organizationId: string) =>
  createOrgPermissionGuards({ getAccess: () => getOrgAccessFor(organizationId), onPlatformBypass });

/** Like `can`, but against the caller's role in `organizationId` rather than the active org. */
export const canIn = (organizationId: string, perms: Record<string, string[]>) => guardsFor(organizationId).can(perms);

/** Like `requirePermission`, but against the caller's role in `organizationId`. Use for writes to an org taken from input. */
export const requirePermissionIn = (organizationId: string, perms: Record<string, string[]>) =>
  guardsFor(organizationId).requirePermission(perms);

/** Assigning or removing `owner` (also inside a comma list) takes owner in that org, or super_admin. */
export async function requireOwnerToGrant(organizationId: string, ...roles: (string | null | undefined)[]): Promise<void> {
  if (!roles.some((r) => r?.split(",").some((x) => x.trim() === "owner"))) return;
  const access = await getOrgAccessFor(organizationId);
  if (access.kind === "platform") return;
  if (access.kind === "member" && access.roles.includes(orgRoles.owner)) return;
  throw new ForbiddenError();
}

/** Signed-in staff account (not a customer). For routes with no domain permission, like generic uploads. */
export async function assertStaffSession(): Promise<void> {
  const session = await getSession();
  if (!session?.user) throw new AuthError();
  if (!isStaffRole(session.user.role)) throw new ForbiddenError();
}
