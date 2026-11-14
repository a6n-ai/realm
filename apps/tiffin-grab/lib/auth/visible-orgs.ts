import { eq } from "drizzle-orm";
import { resolveVisibleOrgIds } from "@foundry/auth";
import { db } from "@/db/client";
import { member } from "@/db/schema";
import { userIdByPublicId } from "@/lib/identity/user-ids";

// Which orgs a session may see. super_admin bypasses to "all"; everyone else is
// scoped to their `member` rows. [] means "show nothing", never an unscoped query.
export async function resolveSessionVisibleOrgIds(
  session: { user: { id: string; platformRole?: string | null } } | null,
): Promise<"all" | string[]> {
  if (!session) return [];
  const userId = await userIdByPublicId(session.user.id);
  if (!userId) return [];
  const memberOrgIds = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .then((rows) => rows.map((r) => r.organizationId));
  return resolveVisibleOrgIds({ platformRole: session.user.platformRole ?? null, memberOrgIds });
}
