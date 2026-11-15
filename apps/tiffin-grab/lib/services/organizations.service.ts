import { isUniqueViolation } from "@/lib/db/errors";
import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm";
import type { OrgLocation } from "@foundry/commons";
import { db } from "@/db/client";
import { member, organization, organizationRole, users } from "@/db/schema";
import { userIdByPublicId } from "@/lib/identity/user-ids";

// Per-request memoized: the dashboard shell resolves the same actor several times.

export type MemberOrganization = { id: string; name: string; clientCode: string };

// Every org a staff session has a member row in, for the header switcher. A
// customer session (no member rows) or a session with exactly one org both
// resolve here — the caller decides whether one org is enough to show a
// switcher (it isn't: OrgSwitcher hides itself below 2).
export async function getMemberOrganizations(session: { user: { id: string } } | null): Promise<MemberOrganization[]> {
  if (!session) return [];
  const userId = await userIdByPublicId(session.user.id);
  if (!userId) return [];
  return db
    .select({ id: organization.id, name: organization.name, clientCode: organization.clientCode })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
}

export async function getBrandOrganizationAddress(): Promise<string | null> {
  const brandId = await getBrandOrgId();
  if (!brandId) return null;
  const [row] = await db.select({ address: organization.address }).from(organization).where(eq(organization.id, brandId)).limit(1);
  return row?.address ?? null;
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

export type FranchiseLocation = OrgLocation & { id: string; name: string; clientCode: string };

// Public-safe location listing (no member counts, no parent/brand rows without
// a city set) — used by the public location popup/picker and the /locations
// map. Not gated behind a permission check; nothing here is sensitive.
export async function listFranchiseLocations(): Promise<FranchiseLocation[]> {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      clientCode: organization.clientCode,
      city: organization.city,
      address: organization.address,
      latitude: organization.latitude,
      longitude: organization.longitude,
    })
    .from(organization)
    .where(sql`${organization.city} is not null`);
}

// Distinct cities already set on an org, for the admin location dropdown and
// (later) the public location picker — no hardcoded city list to keep in sync.
export async function listFranchiseCities(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ city: organization.city })
    .from(organization)
    .where(sql`${organization.city} is not null`);
  return rows.map((r) => r.city!).sort();
}

export async function getOrganization(id: string) {
  const [row] = await db.select().from(organization).where(eq(organization.id, id)).limit(1);
  return row ?? null;
}

export type UpdateOrganizationInput = { name: string; clientCode: string; region: string | null } & OrgLocation;
export type UpdateOrganizationResult = { ok: true } | { ok: false; error: string };

const isClientCodeConflict = (e: unknown) => isUniqueViolation(e, "organization_client_code_unique");

export async function updateOrganization(
  id: string,
  fields: UpdateOrganizationInput,
): Promise<UpdateOrganizationResult> {
  try {
    await db
      .update(organization)
      .set({
        name: fields.name,
        clientCode: fields.clientCode,
        region: fields.region,
        city: fields.city,
        address: fields.address,
        latitude: fields.latitude,
        longitude: fields.longitude,
      })
      .where(eq(organization.id, id));
    return { ok: true };
  } catch (e) {
    if (isClientCodeConflict(e)) return { ok: false, error: "That client code is already in use." };
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

export type MemberRow = { memberId: string; userId: string; email: string; role: string };

export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({ memberId: member.id, userId: users.publicId, email: users.email, role: member.role })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(eq(member.organizationId, organizationId));
  return rows.map((r) => ({ memberId: r.memberId, userId: r.userId, email: r.email ?? "", role: r.role }));
}

const isMemberConflict = (e: unknown) => isUniqueViolation(e, "member_org_user_unique");

// The only two roles anything in this codebase writes to member.role (see
// createFranchise's owner-member insert and db/seed-brand-org.ts's admin backfill).
// Any role the org defines, built-in or custom; the action checks it against getRoleOptions.
export type MemberRole = string;

export async function addMember(organizationId: string, userPublicId: string, role: MemberRole): Promise<void> {
  const userId = await userIdByPublicId(userPublicId);
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
  const userId = await userIdByPublicId(userPublicId);
  if (!userId) return;
  await db.delete(member).where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
}

export const BRAND_CLIENT_CODE = "TG";

/**
 * The org new orders, leads, holidays and staff memberships belong to: the top-level org with the
 * brand client code, else the oldest top-level org (test DBs have several; a bare limit(1) would
 * return whichever row Postgres reads first).
 */
export async function getBrandOrgId(tx: { select: typeof db.select } = db): Promise<string | null> {
  const [row] = await tx.select({ id: organization.id }).from(organization).where(isNull(organization.parentOrganizationId))
    .orderBy(sql`${organization.clientCode} is distinct from ${BRAND_CLIENT_CODE}`, asc(organization.createdAt)).limit(1);
  return row?.id ?? null;
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

export type CustomRoleRow = { id: string; role: string; permission: Record<string, string[]> };

/** Custom roles of an org, read from the table: auth.api.listOrgRoles needs ac:read and a member row, which pickers and super_admin lack. */
export async function listCustomRoles(organizationId: string): Promise<CustomRoleRow[]> {
  const rows = await db
    .select({ id: organizationRole.id, role: organizationRole.role, permission: organizationRole.permission })
    .from(organizationRole)
    .where(eq(organizationRole.organizationId, organizationId))
    .orderBy(asc(organizationRole.role));
  return rows.map((r) => ({ ...r, permission: JSON.parse(r.permission) as Record<string, string[]> }));
}

export async function listCustomRoleNames(organizationId: string): Promise<string[]> {
  return (await listCustomRoles(organizationId)).map((r) => r.role);
}

export async function getMemberInOrg(organizationId: string, memberId: string) {
  const [row] = await db
    .select({ id: member.id, userId: member.userId, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.id, memberId)))
    .limit(1);
  return row ?? null;
}

export async function countOwners(organizationId: string): Promise<number> {
  return (await getRoleHolderCounts(organizationId)).owner ?? 0;
}

/** How many members hold each role (comma lists count once per role). */
export async function getRoleHolderCounts(organizationId: string): Promise<Record<string, number>> {
  const rows = await db.select({ role: member.role }).from(member).where(eq(member.organizationId, organizationId));
  const counts: Record<string, number> = {};
  for (const r of rows) {
    for (const name of new Set(r.role.split(",").map((x) => x.trim()).filter(Boolean))) counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

export type UserMembershipRow = { memberId: string; organizationId: string; organizationName: string; role: string };

export async function listMembershipsForUser(userPublicId: string): Promise<UserMembershipRow[]> {
  const userId = await userIdByPublicId(userPublicId);
  if (!userId) return [];
  return db
    .select({ memberId: member.id, organizationId: organization.id, organizationName: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId));
}
