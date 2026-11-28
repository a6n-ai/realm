import { ROOM_TOKEN_TTL_SECONDS, signRoomToken } from "@foundry/collab/token";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { Actor } from "../auth/actor";
import { hitRateLimit } from "./rate-limit";
import { guestTokenSchema } from "./schemas";
import { resolveShare } from "./share-link";

const GUEST_MAX = 30;
const GUEST_WINDOW_MS = 600_000;

export type StaffRoomToken = { ok: true; token: string; canEdit: boolean } | { ok: false; code: "stale" };
export type GuestRoomToken =
  | { ok: true; token: string; docId: string; canEdit: boolean }
  | { ok: false; code: "expired" | "unavailable" | "rate_limited" | "invalid" };

export async function issueStaffRoomToken(db: CrmDb, secret: string, actor: Actor, docId: string): Promise<StaffRoomToken> {
  const found = await db.all(sql`SELECT 1 FROM collab_docs WHERE id = ${docId} AND organization_id = ${actor.organizationId}`);
  if (!found.length) return { ok: false, code: "stale" };
  const canEdit = actor.permissions.includes("inquiry:update");
  const claims = { doc: docId, sub: actor.userId, name: actor.name, edit: canEdit, share: null, until: null };
  return { ok: true, token: await signRoomToken(secret, claims), canEdit };
}

export async function issueGuestRoomToken(
  db: CrmDb,
  secret: string,
  input: { token: string; name: string; ip: string },
  now = Date.now(),
): Promise<GuestRoomToken> {
  if (!(await hitRateLimit(db, `collab:guest:${input.ip}`, GUEST_MAX, GUEST_WINDOW_MS, now))) {
    return { ok: false, code: "rate_limited" };
  }
  const parsed = guestTokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const { token, name } = parsed.data;
  const share = await resolveShare(db, token, now);
  if (share.status !== "ok") return { ok: false, code: share.status };
  const canEdit = share.mode === "edit";
  const claims = {
    doc: share.docId,
    sub: `guest:${share.shareId}:${name.toLowerCase()}`,
    name,
    edit: canEdit,
    share: share.shareId,
    until: share.expiresAt,
  };
  // whole seconds, rounded down, so the token never outlives the link
  const ttl = Math.min(ROOM_TOKEN_TTL_SECONDS, Math.floor(share.expiresAt / 1000) - Math.floor(now / 1000));
  return { ok: true, token: await signRoomToken(secret, claims, ttl, now), docId: share.docId, canEdit };
}
