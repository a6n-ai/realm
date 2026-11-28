import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";

export const KINDS = ["notes", "brainstorm", "client"] as const;
export type DocKind = (typeof KINDS)[number];

/** True for a doc `d` (an alias of collab_docs) that is not in Trash. */
export const notTrashed = sql`NOT EXISTS (SELECT 1 FROM doc_meta t WHERE t.doc_id = d.id AND t.trashed_at IS NOT NULL)`;

/** Asked by the room for every connection: a token can outlive a move to Trash. */
export async function isDocOpen(db: CrmDb, docId: string): Promise<boolean> {
  return (await db.all(sql`SELECT 1 FROM collab_docs d WHERE d.id = ${docId} AND ${notTrashed}`)).length > 0;
}
