import { and, eq, ilike, sql } from "drizzle-orm";
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

export type UpdateOrganizationInput = { name: string; clientCode: string; region: string | null };
export type UpdateOrganizationResult = { ok: true } | { ok: false; error: string };

// Same wrapped-error shape as isMemberConflict below, but keyed to the
// organization_client_code_unique index instead of the member org+user one.
function isClientCodeConflict(e: unknown): boolean {
  type PgErr = { code?: string; constraint?: string; constraint_name?: string; cause?: PgErr };
  const err = e as PgErr;
  const layers = [err, err?.cause, err?.cause?.cause].filter(Boolean) as PgErr[];
  return layers.some(
    (l) => l.code === "23505" && (l.constraint ?? l.constraint_name ?? "") === "organization_client_code_unique",
  );
}

export async function updateOrganization(
  id: string,
  fields: UpdateOrganizationInput,
): Promise<UpdateOrganizationResult> {
  try {
    await db
      .update(organization)
      .set({ name: fields.name, clientCode: fields.clientCode, region: fields.region })
      .where(eq(organization.id, id));
    return { ok: true };
  } catch (e) {
    if (isClientCodeConflict(e)) return { ok: false, error: "That client code is already in use." };
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
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

// The only two roles anything in this codebase writes to member.role (see
// createFranchise's owner-member insert and seed-brand-org.ts's admin backfill).
export type MemberRole = "owner" | "admin";

export async function addMember(organizationId: string, userPublicId: string, role: MemberRole): Promise<void> {
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

export type UserSearchRow = { publicId: string; email: string };

export async function searchUsersByEmail(query: string): Promise<UserSearchRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const rows = await db
    .select({ publicId: users.publicId, email: users.email })
    .from(users)
    .where(ilike(users.email, `%${trimmed}%`))
    .limit(8);
  return rows.filter((r): r is UserSearchRow => r.email !== null);
}

export async function updateMemberRole(
  organizationId: string,
  userPublicId: string,
  role: MemberRole,
): Promise<void> {
  const userId = await resolveUserId(userPublicId);
  if (!userId) throw new Error("User not found");
  await db
    .update(member)
    .set({ role })
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
}
