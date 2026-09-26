import { Role, type RoleValue, ValidationError } from "@foundry/commons";
import type { Condition, FilterCondition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { columnResolver, conditionToSql } from "@foundry/database";
import { and, asc, desc, eq, exists, getTableColumns, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organization, session as sessionTable, users } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";
import { resolveOrgScopeMode } from "@/lib/services/org-scope";
import { usersRepository, type UserRow } from "./users.repository";
import { currentUserId, SessionUpdatableService } from "./session-service";

export const USER_STATUSES = ["active", "inactive", "suspended", "deleted"] as const;
export type UserStatusValue = (typeof USER_STATUSES)[number];

export function tombstoneEmail(publicId: string): string {
  return `deleted-${publicId}@deleted.invalid`;
}

export type UserSortColumn = "name" | "email" | "role" | "status";
export type UserListRow = UserRow & { orgNames: string | null };

const USER_SORT_COL = {
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
} as const;

function resolveUserFacet(f: FilterCondition) {
  return columnResolver({
    role: users.role,
    status: users.status,
    name: users.name,
    email: users.email,
  })(f);
}

/**
 * Keep `member` rows in step with `users.role`: staff with no membership land in
 * the brand org (parentOrganizationId null). Staff already in a franchise are left
 * alone so a role change never widens their visibility.
 */
async function ensureStaffMembership(userId: bigint, role: string): Promise<void> {
  const [existing] = await db.select({ id: member.id }).from(member).where(eq(member.userId, userId)).limit(1);
  if (existing) return;
  const [brand] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(isNull(organization.parentOrganizationId))
    .orderBy(organization.createdAt)
    .limit(1);
  if (!brand) return;
  await db.insert(member).values({ organizationId: brand.id, userId, role }).onConflictDoNothing();
}

class UsersService extends SessionUpdatableService<typeof users> {
  constructor(protected readonly repo: typeof usersRepository) {
    super(repo);
  }

  async queryUsers(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<UserSortColumn> = { column: "name", dir: "asc" },
  ): Promise<Page<UserListRow>> {
    const scopeMode = await resolveOrgScopeMode();
    const where = and(
      conditionToSql(condition, resolveUserFacet),
      scopeMode.mode === "org"
        ? exists(
            db
              .select({ n: sql`1` })
              .from(member)
              .where(and(eq(member.userId, users.id), eq(member.organizationId, scopeMode.orgId))),
          )
        : undefined,
    );
    const col = USER_SORT_COL[sort.column] ?? users.name;

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          ...getTableColumns(users),
          orgNames: sql<string | null>`string_agg(distinct ${organization.name}, ', ')`,
        })
        .from(users)
        .leftJoin(member, eq(member.userId, users.id))
        .leftJoin(organization, eq(organization.id, member.organizationId))
        .where(where)
        .groupBy(users.id)
        .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
        .limit(page.size)
        .offset(page.page * page.size),
      db.select({ count: sql<number>`cast(count(*) as int)` }).from(users).where(where),
    ]);

    return { items, page: page.page, size: page.size, total: count };
  }

  async markPasswordUnset(publicId: string): Promise<void> {
    await super.update(publicId, { passwordSet: false });
  }

  async setStatus(publicId: string, status: UserStatusValue): Promise<UserRow> {
    if (!USER_STATUSES.includes(status)) throw new ValidationError("Unknown account status");

    const actorId = await currentUserId();
    const [target] = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.publicId, publicId))
      .limit(1);
    if (!target) throw new ValidationError("User not found");
    if (actorId && target.id === actorId) {
      throw new ValidationError("You cannot change your own account status.");
    }
    if (target.status === "deleted") {
      throw new ValidationError("This account has been deleted and cannot be reactivated.");
    }

    const row = await super.update(publicId, { status });
    if (status !== "active") {
      await db.delete(sessionTable).where(eq(sessionTable.userId, target.id));
    }
    return row;
  }

  async setRole(publicId: string, role: RoleValue): Promise<UserRow> {
    if (role !== Role.ADMIN && role !== Role.MEMBER) {
      throw new ValidationError("Unknown role");
    }
    const actorId = await currentUserId();
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    if (!target) throw new ValidationError("User not found");
    if (actorId && target.id === actorId) {
      throw new ValidationError("You cannot change your own role.");
    }
    const updated = await super.update(publicId, { role });
    await ensureStaffMembership(target.id, role);
    return updated;
  }

  async softDelete(publicId: string): Promise<UserRow> {
    const actorId = await currentUserId();
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    if (!target) throw new ValidationError("User not found");
    if (actorId && target.id === actorId) {
      throw new ValidationError("You cannot remove your own account.");
    }
    const row = await super.update(publicId, {
      status: "deleted",
      email: tombstoneEmail(publicId),
    });
    await db.delete(sessionTable).where(eq(sessionTable.userId, target.id));
    return row;
  }
}

export const usersService = new UsersService(usersRepository);
