import { atomic, newId } from "@foundry/database";
import { DEFAULT_LINK_TTL_SECONDS } from "@foundry/collab/limits";
import type { RoomControl } from "@foundry/collab/server";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { listOwners } from "../inquiries/queries";
import { notTrashed, type DocKind } from "./meta";
import type { DocActor, Refusal } from "../meeting-docs/service";
import { createShareOps } from "../meeting-docs/share-ops";
import { docAccess, OWN_DOC } from "./access";

export type MemberGrant = { userId: string; name: string; mode: "edit" | "view" };

const stale: Refusal = { ok: false, code: "stale" };
const invalid: Refusal = { ok: false, code: "invalid" };

// Bound to one organisation and one member: creating their docs and sharing them with members. Listing and the rest: library.ts.
export function createDocsService(db: CrmDb, org: string, userId: string, rooms: RoomControl) {
  const mine = OWN_DOC + userId;
  const owns = async (docId: string) => (await docAccess(db, org, userId, docId))?.access === "owner";
  const grantOf = async (docId: string, member: string) =>
    (await db.all<{ id: string }>(sql`SELECT id FROM doc_members WHERE doc_id = ${docId} AND user_id = ${member}`))[0]?.id;

  return {
    async create(actor: DocActor, kind: DocKind = "notes"): Promise<{ ok: true; id: string }> {
      const id = newId("cdc");
      const now = Date.now();
      await atomic(db, () => [
        sql`INSERT INTO collab_docs (id, created_at, created_by, updated_at, organization_id, owner_ref, title, default_link_ttl_seconds)
          VALUES (${id}, ${now}, ${actor.userId}, ${now}, ${org}, ${mine}, 'Untitled', ${DEFAULT_LINK_TTL_SECONDS})`,
        sql`INSERT INTO doc_meta (id, created_at, created_by, updated_at, doc_id, kind)
          VALUES (${newId("dmt")}, ${now}, ${actor.userId}, ${now}, ${id}, ${kind})`,
      ]);
      return { ok: true, id };
    },

    async get(docId: string) {
      const access = await docAccess(db, org, userId, docId);
      if (!access) return null;
      const [row] = await db.all<{ id: string; title: string; defaultLinkTtlSeconds: number; ownerName: string | null }>(sql`
        SELECT d.id, d.title, d.default_link_ttl_seconds AS defaultLinkTtlSeconds, u.name AS ownerName
        FROM collab_docs d LEFT JOIN users u ON u.id = d.created_by WHERE d.id = ${docId}`);
      return row ? { ...row, access: access.access } : null;
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
      if (old) await rooms.revoke(docId, old);
      // a new id per change: a room token for the old access is then refused
      try {
        await atomic(db, () => [
          // only the grant read above: if another change replaced it, the insert hits the unique index and nothing is written
          sql`DELETE FROM doc_members WHERE id = ${old ?? null}`,
          sql`INSERT INTO doc_members (id, created_at, created_by, updated_at, doc_id, user_id, mode)
            VALUES (${newId("dmb")}, ${now}, ${actor.userId}, ${now}, ${docId}, ${member}, ${mode})`,
        ]);
      } catch (err) {
        if ((await grantOf(docId, member)) !== old) return stale;
        throw err;
      }
      if (old) await rooms.revoke(docId, old);
      return { ok: true };
    },

    async removeMember(docId: string, member: string): Promise<{ ok: true } | Refusal> {
      if (!(await owns(docId))) return stale;
      const old = await grantOf(docId, member);
      if (!old) return stale;
      await rooms.revoke(docId, old);
      await db.run(sql`DELETE FROM doc_members WHERE id = ${old}`);
      await rooms.revoke(docId, old);
      return { ok: true };
    },

    links: createShareOps(db, rooms, sql`d.organization_id = ${org} AND d.owner_ref = ${mine} AND ${notTrashed}`),
  };
}
