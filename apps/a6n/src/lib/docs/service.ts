import { atomic, newId } from "@foundry/database";
import { DEFAULT_LINK_TTL_SECONDS } from "@foundry/collab/limits";
import type { RoomControl } from "@foundry/collab/server";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { listOwners } from "../inquiries/queries";
import type { DocActor, Refusal } from "../meeting-docs/service";
import { createShareOps } from "../meeting-docs/share-ops";
import { activeMember, docAccess, OWN_DOC, type Access } from "./access";

export type DocListItem = {
  id: string;
  title: string;
  updatedAt: number;
  ownerName: string | null;
  access: Access;
  sharedWith: number;
  activeLinks: number;
};
export type MemberGrant = { userId: string; name: string; mode: "edit" | "view" };

const stale: Refusal = { ok: false, code: "stale" };
const invalid: Refusal = { ok: false, code: "invalid" };

// Bound to one organisation and one member: their own docs, and the ones shared with them.
export function createDocsService(db: CrmDb, org: string, userId: string, rooms: RoomControl) {
  const mine = OWN_DOC + userId;
  const owns = async (docId: string) => (await docAccess(db, org, userId, docId))?.access === "owner";
  const grantOf = async (docId: string, member: string) =>
    (await db.all<{ id: string }>(sql`SELECT id FROM doc_members WHERE doc_id = ${docId} AND user_id = ${member}`))[0]?.id;

  return {
    async create(actor: DocActor): Promise<{ ok: true; id: string }> {
      const id = newId("cdc");
      const now = Date.now();
      await db.run(sql`INSERT INTO collab_docs (id, created_at, created_by, updated_at, organization_id, owner_ref, title, default_link_ttl_seconds)
        VALUES (${id}, ${now}, ${actor.userId}, ${now}, ${org}, ${mine}, 'Untitled', ${DEFAULT_LINK_TTL_SECONDS})`);
      return { ok: true, id };
    },

    async listMine(): Promise<DocListItem[]> {
      return db.all<DocListItem>(sql`SELECT d.id, d.title, d.updated_at AS updatedAt, u.name AS ownerName, 'owner' AS access,
          (SELECT count(*) FROM doc_members g WHERE g.doc_id = d.id) AS sharedWith,
          (SELECT count(*) FROM collab_shares s WHERE s.doc_id = d.id AND s.revoked_at IS NULL AND s.expires_at > ${Date.now()}) AS activeLinks
        FROM collab_docs d LEFT JOIN users u ON u.id = d.created_by
        WHERE d.organization_id = ${org} AND d.owner_ref = ${mine}
        ORDER BY d.updated_at DESC, d.id DESC`);
    },

    async listShared(): Promise<DocListItem[]> {
      return db.all<DocListItem>(sql`SELECT d.id, d.title, d.updated_at AS updatedAt, u.name AS ownerName, g.mode AS access,
          0 AS sharedWith, 0 AS activeLinks
        FROM doc_members g JOIN collab_docs d ON d.id = g.doc_id LEFT JOIN users u ON u.id = d.created_by
        WHERE g.user_id = ${userId} AND d.organization_id = ${org} AND d.owner_ref LIKE ${OWN_DOC + "%"} AND ${activeMember(sql`g.user_id`)}
        ORDER BY d.updated_at DESC, d.id DESC`);
    },

    async get(docId: string) {
      const access = await docAccess(db, org, userId, docId);
      if (!access) return null;
      const [row] = await db.all<{ id: string; title: string; defaultLinkTtlSeconds: number; ownerName: string | null }>(sql`
        SELECT d.id, d.title, d.default_link_ttl_seconds AS defaultLinkTtlSeconds, u.name AS ownerName
        FROM collab_docs d LEFT JOIN users u ON u.id = d.created_by WHERE d.id = ${docId}`);
      return row ? { ...row, access: access.access } : null;
    },

    async rename(docId: string, title: string, actor: DocActor): Promise<{ ok: true } | Refusal> {
      if (!(await owns(docId))) return stale;
      const next = title.trim();
      if (!next || next.length > 200) return invalid;
      await db.run(sql`UPDATE collab_docs SET title = ${next}, updated_at = ${Date.now()}, updated_by = ${actor.userId} WHERE id = ${docId}`);
      return { ok: true };
    },

    async remove(docId: string): Promise<{ ok: true } | Refusal> {
      const own = await docAccess(db, org, userId, docId);
      if (own?.access !== "owner") return stale;
      const grants = await db.all<{ id: string }>(sql`SELECT id FROM doc_members WHERE doc_id = ${docId}
        UNION ALL SELECT id FROM collab_shares WHERE doc_id = ${docId}`);
      // grants and links go with the row; sockets are dropped after, so none can rejoin
      await db.run(sql`DELETE FROM collab_docs WHERE id = ${docId}`);
      await Promise.all([own.grant, ...grants.map((g) => g.id)].map((id) => rooms.revoke(docId, id)));
      return { ok: true };
    },

    /** Who can open the doc, and who could be added. Null unless the caller owns it. */
    async members(docId: string): Promise<{ grants: MemberGrant[]; candidates: { id: string; name: string }[] } | null> {
      if (!(await owns(docId))) return null;
      const grants = await db.all<MemberGrant>(sql`SELECT g.user_id AS userId, u.name, g.mode
        FROM doc_members g JOIN users u ON u.id = g.user_id WHERE g.doc_id = ${docId} ORDER BY u.name`);
      const taken = new Set([userId, ...grants.map((g) => g.userId)]);
      return { grants, candidates: (await listOwners(db, org)).filter((m) => !taken.has(m.id)) };
    },

    async setMember(docId: string, member: string, mode: "edit" | "view", actor: DocActor): Promise<{ ok: true } | Refusal> {
      if (!(await owns(docId))) return stale;
      if ((mode !== "edit" && mode !== "view") || member === userId || !(await listOwners(db, org)).some((m) => m.id === member)) return invalid;
      const old = await grantOf(docId, member);
      const now = Date.now();
      // a new id per change: a room token for the old access is then refused
      await atomic(db, () => [
        sql`DELETE FROM doc_members WHERE doc_id = ${docId} AND user_id = ${member}`,
        sql`INSERT INTO doc_members (id, created_at, created_by, updated_at, doc_id, user_id, mode)
          VALUES (${newId("dmb")}, ${now}, ${actor.userId}, ${now}, ${docId}, ${member}, ${mode})`,
      ]);
      if (old) await rooms.revoke(docId, old);
      return { ok: true };
    },

    async removeMember(docId: string, member: string): Promise<{ ok: true } | Refusal> {
      if (!(await owns(docId))) return stale;
      const old = await grantOf(docId, member);
      if (!old) return stale;
      await db.run(sql`DELETE FROM doc_members WHERE id = ${old}`);
      await rooms.revoke(docId, old);
      return { ok: true };
    },

    links: createShareOps(db, rooms, sql`d.organization_id = ${org} AND d.owner_ref = ${mine}`),
  };
}
