import { and, asc, desc, eq, ilike, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Condition, FilterCondition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { conditionToSql } from "@realm/database";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";

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

export type OrganizationListPageRow = {
  id: string;
  name: string;
  clientCode: string;
  parentOrganizationId: string | null;
  parentName: string | null;
  memberCount: number;
};

// Keys match the clients-table.tsx column keys.
export type OrgSortColumn = "name" | "clientCode";

const parentOrg = alias(organization, "parent_org");

const ORG_SORT_COL = {
  name: organization.name,
  clientCode: organization.clientCode,
} as const;

// Not a plain columnResolver map: the "type" facet has no real column — it
// derives from parentOrganizationId being null (Brand) or not (Franchise) —
// so it needs custom SQL instead of a column lookup.
function resolveOrgFacet(f: FilterCondition) {
  if (f.field === "type") {
    return f.value === "brand" ? isNull(organization.parentOrganizationId) : isNotNull(organization.parentOrganizationId);
  }
  if (f.field === "name") return ilike(organization.name, `%${f.value}%`);
  if (f.field === "clientCode") return ilike(organization.clientCode, `%${f.value}%`);
  throw new Error(`Unknown field: ${f.field}`);
}

/**
 * Paginated Clients listing with parent organization name and member counts.
 */
export async function queryOrganizations(
  condition: Condition | undefined,
  page: PageRequest,
  sort: SortState<OrgSortColumn> = { column: "name", dir: "asc" },
): Promise<Page<OrganizationListPageRow>> {
  const where = conditionToSql(condition, resolveOrgFacet);
  const col = ORG_SORT_COL[sort.column] ?? organization.name;

  const [items, [{ count }]] = await Promise.all([
    db
      .select({
        id: organization.id,
        name: organization.name,
        clientCode: organization.clientCode,
        parentOrganizationId: organization.parentOrganizationId,
        parentName: parentOrg.name,
        memberCount: sql<number>`count(distinct ${member.id})::int`,
      })
      .from(organization)
      .leftJoin(member, eq(member.organizationId, organization.id))
      .leftJoin(parentOrg, eq(parentOrg.id, organization.parentOrganizationId))
      .where(where)
      .groupBy(organization.id, parentOrg.name)
      .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(organization).where(where),
  ]);

  return { items, page: page.page, size: page.size, total: count };
}

export async function getOrganization(id: string) {
  const [row] = await db.select().from(organization).where(eq(organization.id, id)).limit(1);
  return row ?? null;
}

export type FranchiseLocation = {
  id: string;
  name: string;
  clientCode: string;
  city: string | null;
  address: string | null;
  storeLat: string | null;
  storeLng: string | null;
};

// Public-safe location listing (no member counts) — used by the public
// location popup/picker and the /locations map. Not gated behind
// requireAdmin; nothing here is sensitive.
export async function listFranchiseLocations(): Promise<FranchiseLocation[]> {
  return db
    .select({
      id: organization.id,
      name: organization.name,
      clientCode: organization.clientCode,
      city: organization.city,
      address: organization.address,
      storeLat: organization.storeLat,
      storeLng: organization.storeLng,
    })
    .from(organization)
    .where(sql`${organization.city} is not null`);
}

// Distinct cities already set on an org, for the admin location dropdown —
// no hardcoded city list to keep in sync.
export async function listFranchiseCities(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ city: organization.city })
    .from(organization)
    .where(sql`${organization.city} is not null`);
  return rows.map((r) => r.city!).sort();
}

export type UpdateOrganizationInput = {
  name: string;
  clientCode: string;
  region: string | null;
  city: string | null;
  address: string | null;
  storeLat: string | null;
  storeLng: string | null;
};
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
      .set({
        name: fields.name,
        clientCode: fields.clientCode,
        slug: fields.clientCode,
        region: fields.region,
        city: fields.city,
        address: fields.address,
        storeLat: fields.storeLat,
        storeLng: fields.storeLng,
      })
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
