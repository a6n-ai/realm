import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";

// Same publicId -> internal bigint resolution used elsewhere in this app's
// services — kept local since it's a one-line lookup, not shared logic.
async function resolveUserId(publicId: string): Promise<bigint | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
}

export type MemberOrganization = { id: string; name: string; clientCode: string };

// Every org a staff session has a member row in, for the header switcher. A
// session with no member rows or exactly one resolves here too — the caller
// decides whether one org is enough to show a switcher (it isn't).
export async function getMemberOrganizations(session: { user: { id: string } } | null): Promise<MemberOrganization[]> {
  if (!session) return [];
  const userId = await resolveUserId(session.user.id);
  if (!userId) return [];
  return db
    .select({ id: organization.id, name: organization.name, clientCode: organization.clientCode })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
}

export type OrganizationListRow = {
  id: string;
  name: string;
  clientCode: string;
  parentOrganizationId: string | null;
  memberCount: number;
};

export async function listOrganizations(): Promise<OrganizationListRow[]> {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      clientCode: organization.clientCode,
      parentOrganizationId: organization.parentOrganizationId,
      memberCount: sql<number>`count(${member.id})::int`,
    })
    .from(organization)
    .leftJoin(member, eq(member.organizationId, organization.id))
    .groupBy(organization.id);
}

export async function getOrganization(id: string) {
  const [row] = await db.select().from(organization).where(eq(organization.id, id)).limit(1);
  return row ?? null;
}
