import { AuthError, ForbiddenError } from "@foundry/commons";
import { createOrgPermissionGuards } from "@foundry/auth";
import { getSession } from "./session";
import { effectivePermissions, getOrgAccess, getOrgAccessFor, rolePermissions } from "./org-access";
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

/** Can the caller hand out `role` (a comma list too) in that org? Owner and platform admins may hand out anything; others only what they hold. */
export async function canAssignRole(organizationId: string, role: string): Promise<boolean> {
  const access = await getOrgAccessFor(organizationId);
  if (access.kind === "platform") return true;
  if (access.kind === "member" && access.roles.includes(orgRoles.owner)) return true;
  const held = effectivePermissions(access);
  for (const name of role.split(",").map((r) => r.trim()).filter(Boolean)) {
    const granted = await rolePermissions(organizationId, name);
    if (!granted) return false; // unknown role: never assignable
    for (const [resource, actions] of Object.entries(granted)) {
      if (!(actions as string[]).every((a) => held[resource]?.includes(a))) return false;
    }
  }
  return true;
}

/** A role may not grant more than the caller holds in that org (`owner` itself stays with requireOwnerToGrant). */
export async function requireCanAssignRole(organizationId: string, role: string): Promise<void> {
  if (!(await canAssignRole(organizationId, role))) {
    throw new ForbiddenError(`You can't assign the role "${role}": it grants permissions you don't hold.`);
  }
}

/**
 * Acting on a member (re-roling, removing) needs the caller to hold everything the target's CURRENT roles grant.
 * Role names that no longer exist grant nothing, so they are skipped: otherwise a deleted custom role would leave
 * that member permanently out of reach for everyone but owners.
 */
export async function requireCanActOnRoles(organizationId: string, roleList: string | null | undefined): Promise<void> {
  const names = (roleList ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  for (const name of names) {
    if (!(await rolePermissions(organizationId, name))) continue;
    await requireCanAssignRole(organizationId, name);
  }
}

/** Signed-in staff account (not a customer). For routes with no domain permission, like generic uploads. */
export async function assertStaffSession(): Promise<void> {
  const session = await getSession();
  if (!session?.user) throw new AuthError();
  if (!isStaffRole(session.user.role)) throw new ForbiddenError();
}
