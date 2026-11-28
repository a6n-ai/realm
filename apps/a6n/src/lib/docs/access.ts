import { sql, type SQL } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { notTrashed } from "./meta";

export type Access = "owner" | "edit" | "view";

// A member's own doc is `user:<creator>`. The creator's room grant is `own:<userId>`, anyone else's is their doc_members id.
export const OWN_DOC = "user:";
const OWN_GRANT = "own:";

// The person is an active member of the organisation of the doc `d`.
export const activeMember = (userId: SQL) => sql`EXISTS (SELECT 1 FROM members m JOIN users u ON u.id = m.user_id
  WHERE m.user_id = ${userId} AND m.organization_id = d.organization_id AND u.status = 'active')`;

export async function docAccess(db: CrmDb, org: string, userId: string, docId: string): Promise<{ access: Access; grant: string } | null> {
  const [row] = await db.all<{ ownerRef: string; grantId: string | null; mode: "edit" | "view" | null }>(sql`
    SELECT d.owner_ref AS ownerRef, g.id AS grantId, g.mode FROM collab_docs d
    LEFT JOIN doc_members g ON g.doc_id = d.id AND g.user_id = ${userId}
    WHERE d.id = ${docId} AND d.organization_id = ${org} AND d.owner_ref LIKE ${OWN_DOC + "%"} AND ${activeMember(sql`${userId}`)} AND ${notTrashed}`);
  if (!row) return null;
  if (row.ownerRef === OWN_DOC + userId) return { access: "owner", grant: OWN_GRANT + userId };
  return row.grantId && row.mode ? { access: row.mode, grant: row.grantId } : null;
}

export const isMemberGrant = (grant: string) => grant.startsWith(OWN_GRANT) || grant.startsWith("dmb_");

/** Asked by the room on connect: a token can outlive the access it was issued for. */
export async function isGrantActive(db: CrmDb, docId: string, grant: string): Promise<boolean> {
  const userId = grant.slice(OWN_GRANT.length);
  const found = await db.all(
    grant.startsWith(OWN_GRANT)
      ? sql`SELECT 1 FROM collab_docs d WHERE d.id = ${docId} AND d.owner_ref = ${OWN_DOC + userId} AND ${activeMember(sql`${userId}`)}`
      : sql`SELECT 1 FROM doc_members g JOIN collab_docs d ON d.id = g.doc_id
          WHERE g.id = ${grant} AND g.doc_id = ${docId} AND ${activeMember(sql`g.user_id`)}`,
  );
  return found.length > 0;
}
