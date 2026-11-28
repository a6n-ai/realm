import { DurableObject } from "cloudflare:workers";
import type { Env } from "../../env";

export type ArchivedDoc = {
  id: string;
  organizationId: string;
  ownerRef: string;
  kind: string | null;
  title: string;
  /** base64 of the Yjs state, as stored with the doc. */
  snapshot: string | null;
  text: string | null;
  createdAt: number;
  createdBy: string | null;
  archivedAt: number;
  archivedBy: string;
  members: { userId: string; mode: string }[];
  links: { id: string; mode: string; tokenHash: string; expiresAt: number; revokedAt: number | null; createdBy: string | null }[];
};

/**
 * Docs deleted forever in the app, one object per organisation. Their database rows are removed, so this is the
 * remaining copy. Nothing in the app reads it back. Exported by src/server.ts only.
 */
export class DocArchive extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // content in its own columns, unescaped: a row that fits the database fits here (both limit a row to 2 MB)
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS archived_docs (id TEXT PRIMARY KEY, archived_at INTEGER NOT NULL, rest TEXT NOT NULL, snapshot TEXT, text TEXT)",
    );
  }

  /** RPC. Resolves only once the write is durable. Safe to repeat: the latest copy wins. */
  async put(doc: ArchivedDoc): Promise<void> {
    const { snapshot, text, ...rest } = doc;
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO archived_docs (id, archived_at, rest, snapshot, text) VALUES (?, ?, ?, ?, ?)",
      doc.id,
      doc.archivedAt,
      JSON.stringify(rest),
      snapshot,
      text,
    );
  }

  /** RPC, for the owner's recovery tooling and tests. */
  async get(id: string): Promise<ArchivedDoc | null> {
    const [row] = this.ctx.storage.sql
      .exec<{ rest: string; snapshot: string | null; text: string | null }>("SELECT rest, snapshot, text FROM archived_docs WHERE id = ?", id)
      .toArray();
    return row ? { ...(JSON.parse(row.rest) as Omit<ArchivedDoc, "snapshot" | "text">), snapshot: row.snapshot, text: row.text } : null;
  }
}
