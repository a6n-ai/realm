import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organizationRole } from "@/db/schema";

/** One query per table for every visible org; the rules themselves are in org-health.ts. */
export async function loadOrgHealthRows(orgIds: string[]) {
  if (orgIds.length === 0) return { members: [], customRoles: [] };
  const [members, customRoles] = await Promise.all([
    db
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(inArray(member.organizationId, orgIds)),
    db
      .select({ organizationId: organizationRole.organizationId, role: organizationRole.role })
      .from(organizationRole)
      .where(inArray(organizationRole.organizationId, orgIds)),
  ]);
  return { members, customRoles };
}
