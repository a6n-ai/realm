import { UpdatableRepository } from "@foundry/database";
import { and, asc, desc, eq, isNull, lt, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { companies, inquiries, users } from "../../db/schema";
import { likePattern } from "./companies";

export const PAGE_SIZE = 50;

export type InquiryView = "mine" | "unassigned" | "all";

export type InquiryRow = {
  id: string;
  contactName: string | null;
  companyName: string | null;
  stage: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerRemoved: boolean;
  nextFollowUpAt: number | null;
  overdue: boolean;
};

export type ListFilters = { stage?: string; sourceId?: string; overdue?: boolean };

export class InquiriesRepository extends UpdatableRepository<typeof inquiries, CrmDb, string> {
  constructor(db: CrmDb) {
    super(db, inquiries, inquiries.id, inquiries.id);
  }

  async listForView(args: {
    view: InquiryView;
    userId: string;
    filters?: ListFilters;
    search?: string;
    page?: number;
    now?: number;
  }): Promise<{ rows: InquiryRow[]; hasNext: boolean }> {
    const { view, userId, filters = {}, search, page = 0 } = args;
    const now = args.now ?? Date.now();
    const where: (SQL | undefined)[] = [];
    if (view === "mine") where.push(eq(inquiries.ownerId, userId), isNull(inquiries.closedAt));
    if (view === "unassigned") where.push(isNull(inquiries.ownerId), isNull(inquiries.closedAt));
    if (filters.stage) where.push(eq(inquiries.stage, filters.stage));
    if (filters.sourceId) where.push(eq(inquiries.sourceId, filters.sourceId));
    if (filters.overdue) where.push(isNull(inquiries.closedAt), lt(inquiries.nextFollowUpAt, now));
    const q = search?.trim();
    if (q) {
      const p = likePattern(q);
      const esc = (col: SQL | AnyColumn) => sql`${col} like ${p} escape '\\'`;
      where.push(
        or(esc(inquiries.contactName), esc(companies.name), esc(inquiries.email), esc(inquiries.phone)),
      );
    }
    const order =
      view === "all"
        ? [desc(inquiries.createdAt), desc(inquiries.id)]
        : [asc(inquiries.nextFollowUpAt), asc(inquiries.id)];

    const rows = await this.db
      .select({
        id: inquiries.id,
        contactName: inquiries.contactName,
        companyName: companies.name,
        stage: inquiries.stage,
        ownerId: inquiries.ownerId,
        ownerName: users.name,
        ownerStatus: users.status,
        nextFollowUpAt: inquiries.nextFollowUpAt,
        closedAt: inquiries.closedAt,
      })
      .from(inquiries)
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
        stage: r.stage,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        ownerRemoved: r.ownerStatus === "removed",
        nextFollowUpAt: r.nextFollowUpAt,
        overdue: r.closedAt === null && r.nextFollowUpAt !== null && r.nextFollowUpAt < now,
      })),
    };
  }

  async unassignedCounts(now: number = Date.now()): Promise<{ total: number; overdue: number }> {
    const [row] = await this.db
      .select({
        total: sql<number>`count(*)`,
        overdue: sql<number>`coalesce(sum(case when ${inquiries.nextFollowUpAt} < ${now} then 1 else 0 end), 0)`,
      })
      .from(inquiries)
      .where(and(isNull(inquiries.ownerId), isNull(inquiries.closedAt)));
    return { total: Number(row?.total ?? 0), overdue: Number(row?.overdue ?? 0) };
  }
}

export const listForView = (db: CrmDb, args: Parameters<InquiriesRepository["listForView"]>[0]) =>
  new InquiriesRepository(db).listForView(args);

export const unassignedCounts = (db: CrmDb, now?: number) => new InquiriesRepository(db).unassignedCounts(now);
