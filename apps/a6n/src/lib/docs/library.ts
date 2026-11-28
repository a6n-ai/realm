import { atomic, newId } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { Actor } from "../auth/actor";
import type { Archive, Rooms } from "../deps";
import type { Refusal } from "../meeting-docs/service";
import { activeMember, OWN_DOC, type Access } from "./access";
import type { ArchivedDoc } from "./archive";
import type { DocKind } from "./meta";

export type DocPermissions = Record<"rename" | "share" | "setKind" | "duplicate" | "trash" | "restore" | "deleteForever", boolean>;
export type LibraryItem = {
  id: string;
  title: string;
  kind: DocKind;
  source: "mine" | "shared" | "inquiry";
  inquiryId: string | null;
  /** What a member this was shared with may do; null otherwise. */
  access: Access | null;
  ownerName: string | null;
  updatedAt: number;
  trashed: boolean;
  /** Zero unless the actor may manage sharing. */
  sharedWith: number;
  activeLinks: number;
  can: DocPermissions;
};

type Row = {
  id: string;
  title: string;
  ownerRef: string;
  ownerName: string | null;
  updatedAt: number;
  kind: DocKind | null;
  trashedAt: number | null;
  grantMode: "edit" | "view" | null;
  sharedWith: number;
  activeLinks: number;
};

const INQUIRY_DOC = "inquiry:";
const NONE: DocPermissions = { rename: false, share: false, setKind: false, duplicate: false, trash: false, restore: false, deleteForever: false };
const stale: Refusal = { ok: false, code: "stale" };
const invalid: Refusal = { ok: false, code: "invalid" };

/** What this actor sees of a doc, or null when it does not exist for them. */
function view(row: Row, actor: Actor): LibraryItem | null {
  const trashed = row.trashedAt !== null;
  const base = { id: row.id, title: row.title, ownerName: row.ownerName, updatedAt: row.updatedAt, trashed };
  const counts = { sharedWith: row.sharedWith, activeLinks: row.activeLinks };
  const manage = (full: boolean, mayDelete: boolean): DocPermissions => ({
    rename: !trashed,
    share: !trashed,
    setKind: full && !trashed,
    duplicate: full && !trashed,
    trash: !trashed,
    restore: trashed,
    deleteForever: trashed && mayDelete,
  });
  if (row.ownerRef === OWN_DOC + actor.userId) {
    return { ...base, ...counts, kind: row.kind ?? "notes", source: "mine", inquiryId: null, access: null, can: manage(true, true) };
  }
  if (row.ownerRef.startsWith(OWN_DOC)) {
    // someone else's: only a grant shows it, and never once it is in their Trash
    if (!row.grantMode || trashed) return null;
    return { ...base, kind: row.kind ?? "notes", source: "shared", inquiryId: null, access: row.grantMode, sharedWith: 0, activeLinks: 0, can: NONE };
  }
  if (!row.ownerRef.startsWith(INQUIRY_DOC) || !actor.permissions.includes("inquiry:read")) return null;
  const writer = actor.permissions.includes("inquiry:update");
  if (trashed && !writer) return null;
  return {
    ...base,
    ...(writer ? counts : { sharedWith: 0, activeLinks: 0 }),
    kind: "client",
    source: "inquiry",
    inquiryId: row.ownerRef.slice(INQUIRY_DOC.length),
    access: null,
    // a client's record: only workspace owners and admins take it out of the app
    can: writer ? manage(false, actor.role.split(",").some((r) => r === "owner" || r === "admin")) : NONE,
  };
}

// Bound to one actor in one organisation. Only "delete forever" removes rows, and only after the archive has a copy.
export function createDocsLibrary(db: CrmDb, actor: Actor, rooms: Rooms, archive: Archive) {
  const org = actor.organizationId;
  const me = actor.userId;

  const read = async (docId: string | null) =>
    (
      await db.all<Row>(sql`SELECT d.id, d.title, d.owner_ref AS ownerRef, u.name AS ownerName, d.updated_at AS updatedAt,
          m.kind, m.trashed_at AS trashedAt, g.mode AS grantMode,
          (SELECT count(*) FROM doc_members x WHERE x.doc_id = d.id) AS sharedWith,
          (SELECT count(*) FROM collab_shares s WHERE s.doc_id = d.id AND s.revoked_at IS NULL AND s.expires_at > ${Date.now()}) AS activeLinks
        FROM collab_docs d
        LEFT JOIN users u ON u.id = d.created_by
        LEFT JOIN doc_meta m ON m.doc_id = d.id
        LEFT JOIN doc_members g ON g.doc_id = d.id AND g.user_id = ${me}
        WHERE d.organization_id = ${org} AND ${activeMember(sql`${me}`)}
          AND (d.owner_ref = ${OWN_DOC + me} OR g.id IS NOT NULL OR d.owner_ref LIKE ${INQUIRY_DOC + "%"})
          AND (${docId} IS NULL OR d.id = ${docId})
        ORDER BY d.updated_at DESC, d.id DESC`)
    ).flatMap((row) => view(row, actor) ?? []);

  const allowed = async (docId: string, action: keyof DocPermissions) => (await read(docId)).find((item) => item.can[action]);

  // The row exists once, and each change sets only its own columns.
  const mark = (docId: string, set: { kind: DocKind } | { trashedAt: number | null }) => {
    const now = Date.now();
    const [column, value] = "kind" in set ? [sql`kind`, set.kind] : [sql`trashed_at`, set.trashedAt];
    const by = "kind" in set || set.trashedAt === null ? null : me;
    return sql`INSERT INTO doc_meta (id, created_at, created_by, updated_at, doc_id, ${column}, trashed_by)
      VALUES (${newId("dmt")}, ${now}, ${me}, ${now}, ${docId}, ${value}, ${by})
      ON CONFLICT (doc_id) DO UPDATE SET ${column} = excluded.${column}, updated_at = ${now}, updated_by = ${me}
      ${"kind" in set ? sql`` : sql`, trashed_by = excluded.trashed_by`}`;
  };

  // Copy first: if the archive cannot take it, the doc stays in Trash and the action can be retried.
  // True once the rows are gone.
  const archiveDoc = async (docId: string): Promise<boolean> => {
    await rooms.closeAll(docId);
    const [doc] = await db.all<Omit<ArchivedDoc, "archivedAt" | "archivedBy" | "members" | "links"> & { updatedAt: number }>(sql`
      SELECT d.id, d.organization_id AS organizationId, d.owner_ref AS ownerRef, m.kind, d.title, d.snapshot, d.text,
        d.created_at AS createdAt, d.created_by AS createdBy, d.updated_at AS updatedAt
      FROM collab_docs d JOIN doc_meta m ON m.doc_id = d.id WHERE d.id = ${docId} AND m.trashed_at IS NOT NULL`);
    if (!doc) return false;
    const { updatedAt, ...content } = doc;
    const members = await db.all<ArchivedDoc["members"][number]>(sql`SELECT user_id AS userId, mode FROM doc_members WHERE doc_id = ${docId}`);
    const links = await db.all<ArchivedDoc["links"][number]>(sql`SELECT id, mode, token_hash AS tokenHash, expires_at AS expiresAt,
        revoked_at AS revokedAt, created_by AS createdBy FROM collab_shares WHERE doc_id = ${docId}`);
    await archive.put({ ...content, members, links, archivedAt: Date.now(), archivedBy: me });
    // only what was copied: still in Trash and not saved since. Members, links and meta go with the row
    const gone = await db.all(sql`DELETE FROM collab_docs WHERE id = ${docId} AND updated_at = ${updatedAt}
      AND EXISTS (SELECT 1 FROM doc_meta t WHERE t.doc_id = collab_docs.id AND t.trashed_at IS NOT NULL) RETURNING id`);
    return gone.length > 0;
  };

  return {
    async list(): Promise<{ items: LibraryItem[]; trash: LibraryItem[] }> {
      const all = await read(null);
      return { items: all.filter((i) => !i.trashed), trash: all.filter((i) => i.trashed) };
    },

    async rename(docId: string, title: string): Promise<{ ok: true } | Refusal> {
      if (!(await allowed(docId, "rename"))) return stale;
      const next = title.trim();
      if (!next || next.length > 200) return invalid;
      await db.run(sql`UPDATE collab_docs SET title = ${next}, updated_at = ${Date.now()}, updated_by = ${me} WHERE id = ${docId}`);
      return { ok: true };
    },

    async setKind(docId: string, kind: DocKind): Promise<{ ok: true } | Refusal> {
      if (!(await allowed(docId, "setKind"))) return stale;
      await db.run(mark(docId, { kind }));
      return { ok: true };
    },

    /** A new doc of your own with the same text. People and links are not copied. */
    async duplicate(docId: string): Promise<{ ok: true; id: string } | Refusal> {
      const source = await allowed(docId, "duplicate");
      if (!source) return stale;
      const id = newId("cdc");
      const now = Date.now();
      await atomic(db, () => [
        sql`INSERT INTO collab_docs (id, created_at, created_by, updated_at, organization_id, owner_ref, title, snapshot, text, default_link_ttl_seconds)
          SELECT ${id}, ${now}, ${me}, ${now}, organization_id, ${OWN_DOC + me}, substr(title || ' copy', 1, 200), snapshot, text, default_link_ttl_seconds
          FROM collab_docs WHERE id = ${docId}`,
        mark(id, { kind: source.kind }),
      ]);
      return { ok: true, id };
    },

    async trash(docId: string): Promise<{ ok: true } | Refusal> {
      if (!(await allowed(docId, "trash"))) return stale;
      // before: an unreachable room fails the move, which can be retried. After: nobody who rejoined meanwhile stays
      await rooms.closeAll(docId);
      await db.run(mark(docId, { trashedAt: Date.now() }));
      await rooms.closeAll(docId);
      return { ok: true };
    },

    async restore(docId: string): Promise<{ ok: true } | Refusal> {
      if (!(await allowed(docId, "restore"))) return stale;
      await db.run(mark(docId, { trashedAt: null }));
      return { ok: true };
    },

    async deleteForever(docId: string): Promise<{ ok: true } | Refusal> {
      if (!(await allowed(docId, "deleteForever"))) return stale;
      return (await archiveDoc(docId)) ? { ok: true } : stale;
    },

    /** Everything in Trash this actor may delete forever; the rest stays. */
    async emptyTrash(): Promise<{ ok: true; count: number }> {
      const doomed = (await read(null)).filter((item) => item.can.deleteForever);
      let count = 0;
      for (const item of doomed) if (await archiveDoc(item.id)) count++;
      return { ok: true, count };
    },
  };
}
