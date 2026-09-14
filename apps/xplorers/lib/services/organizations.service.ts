import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";

async function resolveUserId(publicId: string): Promise<bigint | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
}

export type MemberOrganization = { id: string; name: string; clientCode: string };

export async function getMemberOrganizations(session: { user: { id: string } } | null): Promise<MemberOrganization[]> {
  if (!session) return [];
  const userId = await resolveUserId(session.user.id);
  if (!userId) return [];
  const directRows = await db
    .select({
      id: organization.id,
      name: organization.name,
      clientCode: organization.clientCode,
      parentOrganizationId: organization.parentOrganizationId,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));

  const brandIds = directRows.filter((r) => r.parentOrganizationId === null).map((r) => r.id);
  const franchiseRows = brandIds.length
    ? await db
        .select({ id: organization.id, name: organization.name, clientCode: organization.clientCode })
        .from(organization)
        .where(inArray(organization.parentOrganizationId, brandIds))
    : [];

  const byId = new Map<string, MemberOrganization>();
  for (const r of [...directRows, ...franchiseRows]) byId.set(r.id, { id: r.id, name: r.name, clientCode: r.clientCode });
  return [...byId.values()];
}

function isMemberConflict(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505";
}

export async function addMember(organizationId: string, userPublicId: string, role: string): Promise<void> {
  const userId = await resolveUserId(userPublicId);
  if (!userId) throw new Error("User not found");
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
        .limit(1);
      if (existing) return;
      await tx.insert(member).values({ organizationId, userId, role });
    });
  } catch (e) {
    if (!isMemberConflict(e)) throw e;
  }
}
