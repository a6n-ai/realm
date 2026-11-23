import type { Visible } from "@/lib/tenant/org-scope";
import { resolveVisibleOrgIds } from "@foundry/auth";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { memberRoleIn } from "@/lib/auth/org-access";

// Which orgs a session may see: the active organization only. super_admin bypasses to "all";
// everyone else gets [activeOrganizationId] when they have a member row there. [] means
// "show nothing", never an unscoped query.
export async function resolveSessionVisibleOrgIds(
  session: {
    user: { id: string; platformRole?: string | null };
    session?: { activeOrganizationId?: string | null };
  } | null,
): Promise<Visible> {
  if (!session) return [];
  const platformRole = session.user.platformRole ?? null;
  if (platformRole === "super_admin") return resolveVisibleOrgIds({ platformRole, memberOrgIds: [] });
  const activeOrgId = session.session?.activeOrganizationId;
  if (!activeOrgId) return [];
  const userId = await userIdByPublicId(session.user.id);
  if (!userId) return [];
  const isMember = (await memberRoleIn(activeOrgId, userId)) != null;
  return resolveVisibleOrgIds({ platformRole, memberOrgIds: isMember ? [activeOrgId] : [] });
}
