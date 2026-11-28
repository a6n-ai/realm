import { newId } from "@foundry/database";
import { EXPIRY_PRESETS, MAX_LINK_TTL_MS } from "@foundry/collab/limits";
import type { RoomControl } from "@foundry/collab/server";
import { hashShareToken, newShareToken } from "@foundry/collab/token";
import { sql, type SQL } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { DocActor, Refusal, ShareRow } from "./service";

const stale: Refusal = { ok: false, code: "stale" };
const invalid: Refusal = { ok: false, code: "invalid" };
const MIN_LINK_TTL_MS = 60_000;

// Link sharing for the docs `scope` allows: a predicate on `collab_docs` as `d`. Every query below includes it.
export function createShareOps(db: CrmDb, rooms: RoomControl, scope: SQL) {
  const inBounds = (expiresAt: number, now: number) =>
    Number.isInteger(expiresAt) && expiresAt > now + MIN_LINK_TTL_MS && expiresAt <= now + MAX_LINK_TTL_MS;

  // The share's doc id, or undefined when it does not exist in this organisation.
  const docOfShare = async (shareId: string) =>
    (
      await db.all<{ docId: string }>(sql`SELECT s.doc_id AS docId FROM collab_shares s
        JOIN collab_docs d ON d.id = s.doc_id WHERE s.id = ${shareId} AND ${scope}`)
    )[0]?.docId;

  return {
    async setDefaultTtl(docId: string, seconds: number, actor: DocActor): Promise<{ ok: true } | Refusal> {
      if (!EXPIRY_PRESETS.some((p) => p.seconds === seconds)) return invalid;
      const updated = await db.all(sql`UPDATE collab_docs AS d SET default_link_ttl_seconds = ${seconds},
        updated_at = ${Date.now()}, updated_by = ${actor.userId}
        WHERE d.id = ${docId} AND ${scope} RETURNING id`);
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
        FROM collab_docs d WHERE d.id = ${docId} AND ${scope} RETURNING id`);
      return inserted.length ? { ok: true, shareId, token } : stale;
    },

    async listShares(docId: string): Promise<ShareRow[]> {
      return db.all<ShareRow>(sql`SELECT s.id, s.mode, s.expires_at AS expiresAt, s.revoked_at AS revokedAt,
          u.name AS createdByName, s.created_at AS createdAt
        FROM collab_shares s JOIN collab_docs d ON d.id = s.doc_id LEFT JOIN users u ON u.id = s.created_by
        WHERE s.doc_id = ${docId} AND ${scope}
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
