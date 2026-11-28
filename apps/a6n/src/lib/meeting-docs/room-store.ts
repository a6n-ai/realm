import { Buffer } from "node:buffer";
import { newId } from "@foundry/database";
import { LIMITS } from "@foundry/collab/limits";
import type { CollabEvent } from "@foundry/collab/server";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { isGrantActive, isMemberGrant } from "../docs/access";

// The Durable Object's storage. There is no actor here: the organisation comes from the doc row.

const REPEAT_WINDOW_MS = { joined: 3_600_000, edited: 600_000 } as const;

export async function loadSnapshot(db: CrmDb, docId: string): Promise<Uint8Array | null> {
  const [row] = await db.all<{ snapshot: string | null }>(sql`SELECT snapshot FROM collab_docs WHERE id = ${docId}`);
  return row?.snapshot ? new Uint8Array(Buffer.from(row.snapshot, "base64")) : null;
}

export async function saveSnapshot(db: CrmDb, docId: string, snapshot: Uint8Array, text: string): Promise<void> {
  await db.run(sql`UPDATE collab_docs SET snapshot = ${Buffer.from(snapshot).toString("base64")},
    text = ${text.slice(0, LIMITS.textChars)}, updated_at = ${Date.now()} WHERE id = ${docId}`);
}

export async function recordRoomEvent(db: CrmDb, docId: string, event: CollabEvent, now = Date.now()): Promise<void> {
  if (event.type === "joined" && !event.guest) return;
  const type = event.type === "joined" ? "doc_joined" : "doc_edited";
  const actor = event.guest ? null : event.sub;
  // The room throttles in memory, which hibernation clears, so repeats are also refused here.
  await db.run(sql`INSERT INTO inquiry_activities (id, created_at, organization_id, inquiry_id, type, note, actor_id)
    SELECT ${newId("iac")}, ${now}, d.organization_id, i.id, ${type}, ${event.name},
      (SELECT m.user_id FROM members m WHERE m.user_id = ${actor} AND m.organization_id = d.organization_id)
    FROM collab_docs d
    JOIN inquiries i ON d.owner_ref = 'inquiry:' || i.id AND i.organization_id = d.organization_id
    WHERE d.id = ${docId} AND NOT EXISTS (
      SELECT 1 FROM inquiry_activities a WHERE a.inquiry_id = i.id AND a.type = ${type} AND a.note = ${event.name}
        AND a.actor_id IS ${actor} AND a.created_at > ${now - REPEAT_WINDOW_MS[event.type]})`);
}

/** Asked on every guest connect: a room token can outlive a revoke or a shorter expiry. */
export async function isShareActive(
  db: CrmDb,
  docId: string,
  shareId: string,
  until: number | null,
  now = Date.now(),
): Promise<boolean> {
  if (isMemberGrant(shareId)) return isGrantActive(db, docId, shareId);
  if (until === null) return false;
  const found = await db.all(sql`SELECT 1 FROM collab_shares WHERE id = ${shareId} AND doc_id = ${docId}
    AND revoked_at IS NULL AND expires_at > ${now} AND expires_at >= ${until}`);
  return found.length > 0;
}
