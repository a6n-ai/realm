import { hashShareToken } from "@foundry/collab/token";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";

export type ShareView =
  | {
      status: "ok";
      shareId: string;
      docId: string;
      mode: "edit" | "view";
      expiresAt: number;
      title: string;
      orgName: string;
      sharedBy: string | null;
    }
  | { status: "expired" }
  | { status: "unavailable" };

type Row = Omit<Extract<ShareView, { status: "ok" }>, "status"> & { revokedAt: number | null };

/** What a guest may learn from a link: nothing from the CRM beyond the doc's title, org and sharer. */
export async function resolveShare(db: CrmDb, token: string, now = Date.now()): Promise<ShareView> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { status: "unavailable" };
  // equality on the hash, so the plain token is never compared
  const [row] = await db.all<Row>(sql`SELECT s.id AS shareId, s.doc_id AS docId, s.mode, s.expires_at AS expiresAt,
      s.revoked_at AS revokedAt, d.title, o.name AS orgName, u.name AS sharedBy
    FROM collab_shares s
    JOIN collab_docs d ON d.id = s.doc_id
    JOIN organizations o ON o.id = d.organization_id
    LEFT JOIN users u ON u.id = s.created_by
    WHERE s.token_hash = ${await hashShareToken(token)}`);
  if (!row || row.revokedAt !== null) return { status: "unavailable" };
  const { revokedAt, ...view } = row;
  return now >= view.expiresAt ? { status: "expired" } : { status: "ok", ...view };
}
