import { atomic, newId } from "@foundry/database";
import { DEFAULT_LINK_TTL_SECONDS, EXPIRY_PRESETS, MAX_LINK_TTL_MS } from "@foundry/collab/limits";
import type { RoomControl } from "@foundry/collab/server";
import { hashShareToken, newShareToken } from "@foundry/collab/token";
import { sql, type SQL } from "drizzle-orm";
import type { CrmDb } from "../../db/client";

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
const invalid: Refusal = { ok: false, code: "invalid" };
const OWNER = "inquiry:";
const MIN_LINK_TTL_MS = 60_000;

// Bound to one organisation: every read and write below is limited to it, shares through their doc.
export function createMeetingDocsService(db: CrmDb, org: string, rooms: RoomControl) {
  const inBounds = (expiresAt: number, now: number) =>
    Number.isInteger(expiresAt) && expiresAt > now + MIN_LINK_TTL_MS && expiresAt <= now + MAX_LINK_TTL_MS;

  const summaries = async (where: SQL) =>
    (
      await db.all<Omit<DocSummary, "hasContent"> & { hasContent: number; ownerRef: string }>(sql`
        SELECT d.id, d.title, d.created_at AS createdAt, u.name AS createdByName, d.owner_ref AS ownerRef,
          d.default_link_ttl_seconds AS defaultLinkTtlSeconds, coalesce(d.text, '') != '' AS hasContent,
          (SELECT count(*) FROM collab_shares s WHERE s.doc_id = d.id AND s.revoked_at IS NULL AND s.expires_at > ${Date.now()}) AS activeShares
        FROM collab_docs d LEFT JOIN users u ON u.id = d.created_by
        WHERE d.organization_id = ${org} AND ${where}
        ORDER BY d.created_at DESC, d.id DESC`)
    ).map((row) => ({ ...row, hasContent: Boolean(row.hasContent) }));

  // The share's doc id, or undefined when it does not exist in this organisation.
  const docOfShare = async (shareId: string) =>
    (
      await db.all<{ docId: string }>(sql`SELECT s.doc_id AS docId FROM collab_shares s
        JOIN collab_docs d ON d.id = s.doc_id WHERE s.id = ${shareId} AND d.organization_id = ${org}`)
    )[0]?.docId;

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

    async setDefaultTtl(docId: string, seconds: number, actor: DocActor): Promise<{ ok: true } | Refusal> {
      if (!EXPIRY_PRESETS.some((p) => p.seconds === seconds)) return invalid;
      const updated = await db.all(sql`UPDATE collab_docs SET default_link_ttl_seconds = ${seconds},
        updated_at = ${Date.now()}, updated_by = ${actor.userId}
        WHERE id = ${docId} AND organization_id = ${org} RETURNING id`);
      return updated.length ? { ok: true } : stale;
    },

    async createShare(
      docId: string,
      input: { mode: "edit" | "view"; expiresAt: number },
      actor: DocActor,
      now = Date.now(),
    ): Promise<{ ok: true; shareId: string; token: string } | Refusal> {
      if ((input.mode !== "edit" && input.mode !== "view") || !inBounds(input.expiresAt, now)) return invalid;
      const shareId = newId("csh");
      const token = newShareToken();
      const inserted = await db.all(sql`INSERT INTO collab_shares
          (id, created_at, created_by, updated_at, doc_id, token_hash, mode, expires_at)
        SELECT ${shareId}, ${now}, ${actor.userId}, ${now}, d.id, ${await hashShareToken(token)}, ${input.mode}, ${input.expiresAt}
        FROM collab_docs d WHERE d.id = ${docId} AND d.organization_id = ${org} RETURNING id`);
      return inserted.length ? { ok: true, shareId, token } : stale;
    },

    async listShares(docId: string): Promise<ShareRow[]> {
      return db.all<ShareRow>(sql`SELECT s.id, s.mode, s.expires_at AS expiresAt, s.revoked_at AS revokedAt,
          u.name AS createdByName, s.created_at AS createdAt
        FROM collab_shares s JOIN collab_docs d ON d.id = s.doc_id LEFT JOIN users u ON u.id = s.created_by
        WHERE s.doc_id = ${docId} AND d.organization_id = ${org}
        ORDER BY s.created_at DESC, s.id DESC`);
    },

    async setShareExpiry(shareId: string, expiresAt: number, actor: DocActor, now = Date.now()): Promise<{ ok: true } | Refusal> {
      if (!inBounds(expiresAt, now)) return invalid;
      const docId = await docOfShare(shareId);
      if (!docId) return stale;
      const updated = await db.all(sql`UPDATE collab_shares SET expires_at = ${expiresAt}, updated_at = ${now},
        updated_by = ${actor.userId} WHERE id = ${shareId} AND revoked_at IS NULL RETURNING id`);
      if (!updated.length) return stale;
      await rooms.revoke(docId, shareId);
      return { ok: true };
    },

    async revokeShare(shareId: string, actor: DocActor): Promise<{ ok: true } | Refusal> {
      const docId = await docOfShare(shareId);
      if (!docId) return stale;
      const now = Date.now();
      const updated = await db.all(sql`UPDATE collab_shares SET revoked_at = ${now}, updated_at = ${now},
        updated_by = ${actor.userId} WHERE id = ${shareId} AND revoked_at IS NULL RETURNING id`);
      // even when already revoked: a retry must still drop sockets if the first drop failed
      await rooms.revoke(docId, shareId);
      return updated.length ? { ok: true } : stale;
    },
  };
}
