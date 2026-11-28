import { atomic, newId } from "@foundry/database";
import { DEFAULT_LINK_TTL_SECONDS } from "@foundry/collab/limits";
import type { RoomControl } from "@foundry/collab/server";
import { sql, type SQL } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { notTrashed } from "../docs/meta";
import { createShareOps } from "./share-ops";

export type Refusal = { ok: false; code: "stale" | "invalid" };
export type DocActor = { userId: string; name: string };
export type DocSummary = {
  id: string;
  title: string;
  createdAt: number;
  createdByName: string | null;
  defaultLinkTtlSeconds: number;
  hasContent: boolean;
  activeShares: number;
};
export type ShareRow = {
  id: string;
  mode: "edit" | "view";
  expiresAt: number;
  revokedAt: number | null;
  createdByName: string | null;
  createdAt: number;
};

const stale: Refusal = { ok: false, code: "stale" };
const OWNER = "inquiry:";

// Bound to one organisation: every read and write below is limited to it, shares through their doc.
export function createMeetingDocsService(db: CrmDb, org: string, rooms: RoomControl) {

  const summaries = async (where: SQL) =>
    (
      await db.all<Omit<DocSummary, "hasContent"> & { hasContent: number; ownerRef: string }>(sql`
        SELECT d.id, d.title, d.created_at AS createdAt, u.name AS createdByName, d.owner_ref AS ownerRef,
          d.default_link_ttl_seconds AS defaultLinkTtlSeconds, coalesce(d.text, '') != '' AS hasContent,
          (SELECT count(*) FROM collab_shares s WHERE s.doc_id = d.id AND s.revoked_at IS NULL AND s.expires_at > ${Date.now()}) AS activeShares
        FROM collab_docs d LEFT JOIN users u ON u.id = d.created_by
        WHERE d.organization_id = ${org} AND ${notTrashed} AND ${where}
        ORDER BY d.created_at DESC, d.id DESC`)
    ).map((row) => ({ ...row, hasContent: Boolean(row.hasContent) }));

  return {
    async start(inquiryId: string, localDate: string, actor: DocActor): Promise<{ ok: true; id: string } | Refusal> {
      const id = newId("cdc");
      const now = Date.now();
      await atomic(db, () => [
        sql`INSERT INTO collab_docs (id, created_at, created_by, updated_at, organization_id, owner_ref, title, default_link_ttl_seconds)
          SELECT ${id}, ${now}, ${actor.userId}, ${now}, ${org}, ${OWNER + inquiryId},
            substr('Meeting with ' || coalesce(i.contact_name, c.name, 'client') || ' - ' || ${localDate}, 1, 200),
            ${DEFAULT_LINK_TTL_SECONDS}
          FROM inquiries i LEFT JOIN companies c ON c.id = i.company_id
          WHERE i.id = ${inquiryId} AND i.organization_id = ${org}`,
        {
          onlyIfPreviousChanged: 1,
          query: sql`INSERT INTO inquiry_activities (id, created_at, organization_id, inquiry_id, type, note, actor_id)
            SELECT ${newId("iac")}, ${now}, ${org}, ${inquiryId}, 'doc_started',
              (SELECT title FROM collab_docs WHERE id = ${id}), ${actor.userId}`,
        },
      ]);
      return (await summaries(sql`d.id = ${id}`)).length ? { ok: true, id } : stale;
    },

    async listForInquiry(inquiryId: string): Promise<DocSummary[]> {
      return (await summaries(sql`d.owner_ref = ${OWNER + inquiryId}`)).map(({ ownerRef, ...doc }) => doc);
    },

    async get(docId: string): Promise<(DocSummary & { inquiryId: string; contactName: string | null }) | null> {
      const [row] = await summaries(sql`d.id = ${docId} AND d.owner_ref LIKE ${OWNER + "%"}`);
      if (!row) return null;
      const { ownerRef, ...doc } = row;
      const inquiryId = ownerRef.slice(OWNER.length);
      const [contact] = await db.all<{ name: string | null }>(sql`SELECT coalesce(i.contact_name, c.name) AS name
        FROM inquiries i LEFT JOIN companies c ON c.id = i.company_id
        WHERE i.id = ${inquiryId} AND i.organization_id = ${org}`);
      return { ...doc, inquiryId, contactName: contact?.name ?? null };
    },

    ...createShareOps(db, rooms, sql`d.organization_id = ${org} AND d.owner_ref LIKE ${OWNER + "%"} AND ${notTrashed}`),
  };
}
