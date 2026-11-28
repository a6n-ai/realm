import { UpdatableRepository } from "@foundry/database";
import { and, asc, desc, eq, gte, isNull, lt, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { companies, inquiries, leadSources, users } from "../../db/schema";
import { likePattern } from "./companies";
import { STAGES, type Stage } from "./stages";

export const PAGE_SIZE = 50;

export type InquiryView = "mine" | "unassigned" | "all";

export type InquiryRow = {
  id: string;
  contactName: string | null;
  companyName: string | null;
  phone: string | null;
  source: string;
  stage: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerRemoved: boolean;
  nextFollowUpAt: number | null;
  overdue: boolean;
};

export const BOARD_CARDS = 50;
export const BOARD_CLOSED_DAYS = 30;
export const BOARD_STAGES = STAGES;
export type BoardColumn = { stage: Stage; count: number; cards: InquiryRow[] };

export type ListFilters = { stage?: string; sourceId?: string; ownerId?: string; overdue?: boolean };

export class InquiriesRepository extends UpdatableRepository<typeof inquiries, CrmDb, string> {
  constructor(db: CrmDb) {
    super(db, inquiries, inquiries.id, inquiries.id);
  }

  private conditions(
    args: { organizationId: string; view: InquiryView; userId: string; filters?: ListFilters; search?: string },
    now: number,
  ): (SQL | undefined)[] {
    const { view, userId, filters = {}, search } = args;
    const where: (SQL | undefined)[] = [eq(inquiries.organizationId, args.organizationId)];
    if (view === "mine") where.push(eq(inquiries.ownerId, userId), isNull(inquiries.closedAt));
    if (view === "unassigned") where.push(isNull(inquiries.ownerId), isNull(inquiries.closedAt));
    if (filters.stage) where.push(eq(inquiries.stage, filters.stage));
    if (filters.sourceId) where.push(eq(inquiries.sourceId, filters.sourceId));
    if (filters.ownerId) where.push(eq(inquiries.ownerId, filters.ownerId));
    if (filters.overdue) where.push(isNull(inquiries.closedAt), lt(inquiries.nextFollowUpAt, now));
    const q = search?.trim();
    if (q) {
      const p = likePattern(q);
      const esc = (col: SQL | AnyColumn) => sql`${col} like ${p} escape '\\'`;
      where.push(or(esc(inquiries.contactName), esc(companies.name), esc(inquiries.email), esc(inquiries.phone)));
    }
    return where;
  }

  // Per-stage counts plus the first BOARD_CARDS cards of each stage. Closed stages only show the last BOARD_CLOSED_DAYS days.
  async board(args: {
    organizationId: string;
    view: InquiryView;
    userId: string;
    filters?: ListFilters;
    search?: string;
    now?: number;
  }): Promise<BoardColumn[]> {
    const now = args.now ?? Date.now();
    const cutoff = now - BOARD_CLOSED_DAYS * 86_400_000;
    const where = and(
      ...this.conditions({ ...args, filters: { ...args.filters, stage: undefined } }, now),
      or(isNull(inquiries.closedAt), gte(inquiries.closedAt, cutoff)),
    );
    const from = sql`FROM ${inquiries}
      INNER JOIN ${leadSources} ON ${inquiries.sourceId} = ${leadSources.id}
      LEFT JOIN ${companies} ON ${inquiries.companyId} = ${companies.id}
      LEFT JOIN ${users} ON ${inquiries.ownerId} = ${users.id}
      WHERE ${where}`;
    const counts = await this.db.all<{ stage: string; n: number }>(sql`SELECT ${inquiries.stage} AS stage, count(*) AS n ${from} GROUP BY ${inquiries.stage}`);
    const cards = await this.db.all<Omit<InquiryRow, "ownerRemoved" | "overdue"> & { ownerStatus: string | null; closedAt: number | null }>(sql`
      SELECT * FROM (
        SELECT ${inquiries.id} AS id, ${inquiries.contactName} AS contactName, ${companies.name} AS companyName, ${inquiries.phone} AS phone,
          ${leadSources.label} AS source, ${inquiries.stage} AS stage, ${inquiries.ownerId} AS ownerId, ${users.name} AS ownerName,
          ${users.status} AS ownerStatus, ${inquiries.nextFollowUpAt} AS nextFollowUpAt, ${inquiries.closedAt} AS closedAt,
          row_number() OVER (
            PARTITION BY ${inquiries.stage}
            ORDER BY CASE WHEN ${inquiries.closedAt} IS NULL THEN ${inquiries.nextFollowUpAt} ELSE -${inquiries.closedAt} END, ${inquiries.id}
          ) AS rn
        ${from}
      ) WHERE rn <= ${BOARD_CARDS}`);
    return BOARD_STAGES.map((stage) => ({
      stage,
      count: Number(counts.find((c) => c.stage === stage)?.n ?? 0),
      cards: cards
        .filter((c) => c.stage === stage)
        .map(({ ownerStatus, closedAt, ...r }) => ({
          ...r,
          ownerRemoved: ownerStatus === "removed",
          overdue: closedAt === null && r.nextFollowUpAt !== null && r.nextFollowUpAt < now,
        })),
    }));
  }

  async listForView(args: {
    organizationId: string;
    view: InquiryView;
    userId: string;
    filters?: ListFilters;
    search?: string;
    page?: number;
    now?: number;
  }): Promise<{ rows: InquiryRow[]; hasNext: boolean }> {
    const { view, filters = {}, page = 0 } = args;
    const now = args.now ?? Date.now();
    const where = this.conditions(args, now);
    const order =
      view === "all"
        ? [desc(inquiries.createdAt), desc(inquiries.id)]
        : [asc(inquiries.nextFollowUpAt), asc(inquiries.id)];

    const rows = await this.db
      .select({
        id: inquiries.id,
        contactName: inquiries.contactName,
        companyName: companies.name,
        phone: inquiries.phone,
        source: leadSources.label,
        stage: inquiries.stage,
        ownerId: inquiries.ownerId,
        ownerName: users.name,
        ownerStatus: users.status,
        nextFollowUpAt: inquiries.nextFollowUpAt,
        closedAt: inquiries.closedAt,
      })
      .from(inquiries)
      .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
      .leftJoin(companies, eq(inquiries.companyId, companies.id))
      .leftJoin(users, eq(inquiries.ownerId, users.id))
      .where(and(...where))
      .orderBy(...order)
      .limit(PAGE_SIZE + 1)
      .offset(page * PAGE_SIZE);

    return {
      hasNext: rows.length > PAGE_SIZE,
      rows: rows.slice(0, PAGE_SIZE).map((r) => ({
        id: r.id,
        contactName: r.contactName,
        companyName: r.companyName,
        phone: r.phone,
        source: r.source,
        stage: r.stage,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        ownerRemoved: r.ownerStatus === "removed",
        nextFollowUpAt: r.nextFollowUpAt,
        overdue: r.closedAt === null && r.nextFollowUpAt !== null && r.nextFollowUpAt < now,
      })),
    };
  }

  async unassignedCounts(organizationId: string, now: number = Date.now()): Promise<{ total: number; overdue: number }> {
    const [row] = await this.db
      .select({
        total: sql<number>`count(*)`,
        overdue: sql<number>`coalesce(sum(case when ${inquiries.nextFollowUpAt} < ${now} then 1 else 0 end), 0)`,
      })
      .from(inquiries)
      .where(and(eq(inquiries.organizationId, organizationId), isNull(inquiries.ownerId), isNull(inquiries.closedAt)));
    return { total: Number(row?.total ?? 0), overdue: Number(row?.overdue ?? 0) };
  }
}

export const listForView = (db: CrmDb, args: Parameters<InquiriesRepository["listForView"]>[0]) =>
  new InquiriesRepository(db).listForView(args);

export const listBoard = (db: CrmDb, args: Parameters<InquiriesRepository["board"]>[0]) => new InquiriesRepository(db).board(args);

export const unassignedCounts = (db: CrmDb, organizationId: string, now?: number) =>
  new InquiriesRepository(db).unassignedCounts(organizationId, now);
