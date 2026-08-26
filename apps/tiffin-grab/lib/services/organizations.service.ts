import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";

// Same publicId -> internal bigint resolution as orders.service.ts's private
// resolveUserId — kept local rather than exported cross-file since it's a
// one-line lookup, not shared logic.
async function resolveUserId(publicId: string): Promise<bigint | null> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
}

export type MemberOrganization = { id: string; name: string; clientCode: string };

// Every org a staff session has a member row in, for the header switcher. A
// customer session (no member rows) or a session with exactly one org both
// resolve here — the caller decides whether one org is enough to show a
// switcher (it isn't: OrgSwitcher hides itself below 2).
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

export type MemberRow = { userId: string; email: string; role: string };

export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({ userId: users.publicId, email: users.email, role: member.role })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(eq(member.organizationId, organizationId));
  return rows.map((r) => ({ userId: r.userId, email: r.email ?? "", role: r.role }));
}

// True when a Postgres unique-violation (23505) hit the member org+user unique
// index. drizzle wraps the driver error, so the real PostgresError (with code +
// constraint_name) sits on .cause; postgres.js names the field constraint_name.
function isMemberConflict(e: unknown): boolean {
  type PgErr = { code?: string; constraint?: string; constraint_name?: string; cause?: PgErr };
  const err = e as PgErr;
  const layers = [err, err?.cause, err?.cause?.cause].filter(Boolean) as PgErr[];
  return layers.some(
    (l) => l.code === "23505" && (l.constraint ?? l.constraint_name ?? "").includes("member_org_user_unique"),
  );
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
    // Concurrent add for the same org+user can still race the check-then-insert
    // inside the transaction; the unique constraint is the real guard, this is
    // just turning its violation into the same benign no-op the check intended.
    if (!isMemberConflict(e)) throw e;
  }
}

export async function removeMember(organizationId: string, userPublicId: string): Promise<void> {
  const userId = await resolveUserId(userPublicId);
  if (!userId) return;
  await db.delete(member).where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
}
