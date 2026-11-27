import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { listForView, type InquiryRow } from "./repository";
import type { listInquiriesSchema } from "./schemas";
import type { z } from "zod";

export type ListInput = z.output<typeof listInquiriesSchema>;
export type InquiryPage = { rows: InquiryRow[]; hasNext: boolean; page: number };

export async function listInquiriesPage(db: CrmDb, userId: string, input: ListInput): Promise<InquiryPage> {
  const res = await listForView(db, {
    view: input.view,
    userId,
    filters: { stage: input.stage, sourceId: input.source, ownerId: input.owner, overdue: input.due === "1" },
    search: input.q,
    page: input.page - 1,
  });
  return { ...res, page: input.page };
}

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
  overdue: boolean;
  activities: Activity[];
};

export async function getInquiryDetail(db: CrmDb, id: string, now: number = Date.now()): Promise<InquiryDetail | null> {
  const [row] = await db.all<Omit<InquiryDetail, "activities" | "ownerRemoved" | "overdue"> & { ownerStatus: string | null }>(sql`
    SELECT i.id, i.contact_name AS contactName, i.phone, i.email, c.name AS company, s.label AS source,
      ss.label AS subSource, i.requirements, i.stage, i.lost_reason AS lostReason, i.owner_id AS ownerId,
      o.name AS ownerName, o.status AS ownerStatus, i.next_follow_up_at AS nextFollowUpAt,
      i.closed_at AS closedAt, i.created_at AS createdAt
    FROM inquiries i
    JOIN lead_sources s ON s.id = i.source_id
    LEFT JOIN lead_subsources ss ON ss.id = i.sub_source_id
    LEFT JOIN companies c ON c.id = i.company_id
    LEFT JOIN users o ON o.id = i.owner_id
    WHERE i.id = ${id}`);
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

export const listOwners = (db: CrmDb) =>
  db.all<{ id: string; name: string }>(sql`SELECT id, name FROM users WHERE status = 'active' ORDER BY name`);
