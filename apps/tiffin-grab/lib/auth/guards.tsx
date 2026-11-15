import { AuthError, ForbiddenError } from "@foundry/commons";
import { createOrgPermissionGuards } from "@foundry/auth";
import { getSession } from "./session";
import { getOrgAccess } from "./org-access";
import { recordAudit } from "@/lib/identity/audit";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { isStaffRole } from "@/lib/roles";

export const { can, requirePermission } = createOrgPermissionGuards({
  getAccess: getOrgAccess,
  onPlatformBypass: async (userId, perms) =>
    recordAudit({
      entity: "auth",
      entityPublicId: userId,
      operation: "update",
      changes: { _action: "platform_bypass", perms },
      createdBy: (await userIdByPublicId(userId)) ?? null,
    }),
});

/** Signed-in staff account (not a customer). For routes with no domain permission, like generic uploads. */
export async function assertStaffSession(): Promise<void> {
  const session = await getSession();
  if (!session?.user) throw new AuthError();
  if (!isStaffRole(session.user.role)) throw new ForbiddenError();
}
