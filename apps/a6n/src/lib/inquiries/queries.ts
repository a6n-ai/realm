import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { listBoard, listForView, type BoardColumn, type InquiryRow } from "./repository";
import type { listBoardSchema, listInquiriesSchema } from "./schemas";
import type { z } from "zod";

export type ListInput = z.output<typeof listInquiriesSchema>;
export type BoardInput = z.output<typeof listBoardSchema>;
export type InquiryPage = { rows: InquiryRow[]; hasNext: boolean; page: number };

export async function listInquiriesPage(
  db: CrmDb,
  actor: { userId: string; organizationId: string },
  input: ListInput,
): Promise<InquiryPage> {
  const res = await listForView(db, {
    organizationId: actor.organizationId,
    view: input.view,
    userId: actor.userId,
    filters: { stage: input.stage, sourceId: input.source, ownerId: input.owner, overdue: input.due === "1" },
    search: input.q,
    page: input.page - 1,
  });
  return { ...res, page: input.page };
}

export const listBoardColumns = (db: CrmDb, actor: { userId: string; organizationId: string }, input: BoardInput): Promise<BoardColumn[]> =>
  listBoard(db, {
    organizationId: actor.organizationId,
    view: input.view,
    userId: actor.userId,
    filters: { sourceId: input.source, ownerId: input.owner, overdue: input.due === "1" },
    search: input.q,
  });

export type Activity = {
  id: string;
  createdAt: number;
  type: string;
  note: string | null;
  fromStage: string | null;
  toStage: string | null;
  fromOwnerName: string | null;
  toOwnerName: string | null;
  actorName: string | null;
};

export type InquiryDetail = {
  id: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  source: string;
  subSource: string | null;
  requirements: string | null;
  stage: string;
  lostReason: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerRemoved: boolean;
  nextFollowUpAt: number | null;
  closedAt: number | null;
  createdAt: number;
  createdByName: string | null;
  overdue: boolean;
  activities: Activity[];
};

export async function getInquiryDetail(db: CrmDb, organizationId: string, id: string, now: number = Date.now()): Promise<InquiryDetail | null> {
  const [row] = await db.all<Omit<InquiryDetail, "activities" | "ownerRemoved" | "overdue"> & { ownerStatus: string | null }>(sql`
    SELECT i.id, i.contact_name AS contactName, i.phone, i.email, c.name AS company, s.label AS source,
      ss.label AS subSource, i.requirements, i.stage, i.lost_reason AS lostReason, i.owner_id AS ownerId,
      o.name AS ownerName, o.status AS ownerStatus, i.next_follow_up_at AS nextFollowUpAt,
      i.closed_at AS closedAt, i.created_at AS createdAt, cr.name AS createdByName
    FROM inquiries i
    JOIN lead_sources s ON s.id = i.source_id
    LEFT JOIN lead_subsources ss ON ss.id = i.sub_source_id
    LEFT JOIN companies c ON c.id = i.company_id
    LEFT JOIN users o ON o.id = i.owner_id
    LEFT JOIN users cr ON cr.id = i.created_by
    WHERE i.id = ${id} AND i.organization_id = ${organizationId}`);
  if (!row) return null;
  const activities = await db.all<Activity>(sql`
    SELECT a.id, a.created_at AS createdAt, a.type, a.note, a.from_stage AS fromStage, a.to_stage AS toStage,
      fo.name AS fromOwnerName, tw.name AS toOwnerName, ac.name AS actorName
    FROM inquiry_activities a
    LEFT JOIN users fo ON fo.id = a.from_owner_id
    LEFT JOIN users tw ON tw.id = a.to_owner_id
    LEFT JOIN users ac ON ac.id = a.actor_id
    WHERE a.inquiry_id = ${id}
    ORDER BY a.created_at DESC, a.id DESC`);
  const { ownerStatus, ...rest } = row;
  return {
    ...rest,
    ownerRemoved: ownerStatus === "removed",
    overdue: row.closedAt === null && row.nextFollowUpAt !== null && row.nextFollowUpAt < now,
    activities,
  };
}

// People who can own this organisation's inquiries: its active members.
export const listOwners = (db: CrmDb, organizationId: string) =>
  db.all<{ id: string; name: string }>(sql`SELECT u.id, u.name FROM users u
    JOIN members m ON m.user_id = u.id AND m.organization_id = ${organizationId}
    WHERE u.status = 'active' ORDER BY u.name`);
