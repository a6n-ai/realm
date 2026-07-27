import type { Condition, FilterCondition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { columnResolver, conditionToSql } from "@realm/database";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";
import { describeAuditAction } from "./audit-describe";

export type AuditSortColumn = "time" | "entity" | "operation" | "actor";

export type AuditListRow = {
  publicId: string;
  entity: string;
  entityPublicId: string;
  operation: (typeof auditLog.$inferSelect)["operation"];
  changes: Record<string, unknown> | null;
  createdAt: number;
  actionLabel: string;
  actorName: string | null;
  actorEmail: string | null;
  actorPublicId: string | null;
};

const SORT_COL = {
  time: auditLog.createdAt,
  entity: auditLog.entity,
  operation: auditLog.operation,
  actor: users.email,
} as const;

function resolveAuditFacet(f: FilterCondition) {
  return columnResolver({
    entity: auditLog.entity,
    operation: auditLog.operation,
    entityPublicId: auditLog.entityPublicId,
    createdAt: auditLog.createdAt,
    actorEmail: users.email,
    actorName: users.name,
  })(f);
}

/**
 * Admin read API for `audit_log` — joins actor from users.
 * Writes go through {@link recordAudit} / Session*Service, not this service.
 */
class AuditService {
  async queryLogs(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<AuditSortColumn> = { column: "time", dir: "desc" },
  ): Promise<Page<AuditListRow>> {
    const where = conditionToSql(condition, resolveAuditFacet);
    const col = SORT_COL[sort.column] ?? auditLog.createdAt;
    const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

    const [rows, [{ count }]] = await Promise.all([
      db
        .select({
          publicId: auditLog.publicId,
          entity: auditLog.entity,
          entityPublicId: auditLog.entityPublicId,
          operation: auditLog.operation,
          changes: auditLog.changes,
          createdAt: auditLog.createdAt,
          actorName: users.name,
          actorEmail: users.email,
          actorPublicId: users.publicId,
        })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.createdBy, users.id))
        .where(where)
        .orderBy(orderBy)
        .limit(page.size)
        .offset(page.page * page.size),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.createdBy, users.id))
        .where(where),
    ]);

    return {
      items: rows.map((r) => ({
        publicId: r.publicId,
        entity: r.entity,
        entityPublicId: r.entityPublicId,
        operation: r.operation,
        changes: (r.changes as Record<string, unknown> | null) ?? null,
        createdAt: r.createdAt,
        actionLabel: describeAuditAction({
          entity: r.entity,
          operation: r.operation,
          changes: (r.changes as Record<string, unknown> | null) ?? null,
        }),
        actorName: r.actorName,
        actorEmail: r.actorEmail,
        actorPublicId: r.actorPublicId,
      })),
      page: page.page,
      size: page.size,
      total: count,
    };
  }
}

export const auditService = new AuditService();
