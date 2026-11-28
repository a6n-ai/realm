import { env } from "cloudflare:test";
import { verifyRoomToken } from "@foundry/collab/token";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { actorOf, insertOrg, TEST_ORG } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { issueGuestRoomToken, issueStaffRoomToken } from "../room-token";
import { guestTokenSchema } from "../schemas";
import { createMeetingDocsService } from "../service";
import { ME, seed } from "./seed";

const SECRET = "s".repeat(32);
const db = () => getDb(env);
const svc = () => createMeetingDocsService(db(), TEST_ORG, { revoke: async () => {} });
const actor = actorOf(ME, "Sam", "member");
const HOUR = 3_600_000;
let docId = "";
let ip = 0;

const share = async (mode: "edit" | "view" = "edit", expiresAt = Date.now() + HOUR, now = Date.now()) => {
  const r = await svc().createShare(docId, { mode, expiresAt }, actor, now);
  if (!r.ok) throw new Error(r.code);
  return { ...r, expiresAt };
};
const asGuest = (token: string, over: { name?: string; ip?: string } = {}, now = Date.now()) =>
  issueGuestRoomToken(db(), SECRET, { token, name: "Ana", ip: `10.9.0.${++ip}`, ...over }, now);

beforeAll(applyMigrations);
beforeEach(async () => {
  await seed();
  const r = await svc().start("inq_md", "2026-11-28", actor);
  if (!r.ok) throw new Error(r.code);
  docId = r.id;
});

test("staff token carries session name and edit from inquiry:update", async () => {
  const full = await issueStaffRoomToken(db(), SECRET, actor, docId);
  if (!full.ok) throw new Error(full.code);
  expect(full.canEdit).toBe(true);
  expect(await verifyRoomToken(SECRET, full.token)).toMatchObject({ doc: docId, sub: ME, name: "Sam", edit: true, share: null, until: null });
  const reader = await issueStaffRoomToken(db(), SECRET, { ...actor, permissions: ["inquiry:read"] }, docId);
  if (!reader.ok) throw new Error(reader.code);
  expect(reader.canEdit).toBe(false);
  expect(await verifyRoomToken(SECRET, reader.token)).toMatchObject({ edit: false });
});

test("staff of org B gets stale for org A doc", async () => {
  const other = { ...actor, organizationId: await insertOrg() };
  expect(await issueStaffRoomToken(db(), SECRET, other, docId)).toEqual({ ok: false, code: "stale" });
});

test("guest name must be 1-60 chars after trim", async () => {
  const parse = (name: string) => guestTokenSchema.safeParse({ token: "t", name }).success;
  expect([parse("   "), parse("a".repeat(61)), parse("a".repeat(60)), parse(` ${"a".repeat(60)} `)]).toEqual([false, false, true, true]);
  const { token } = await share();
  expect(await asGuest(token, { name: "  " })).toEqual({ ok: false, code: "invalid" });
});

test("view link gives a read-only guest token with until = expiresAt", async () => {
  const link = await share("view");
  const res = await asGuest(link.token, { name: "  Ana  " });
  if (!res.ok) throw new Error(res.code);
  expect(res).toMatchObject({ docId, canEdit: false });
  expect(await verifyRoomToken(SECRET, res.token)).toMatchObject({
    doc: docId,
    sub: `guest:${link.shareId}:ana`,
    name: "Ana",
    edit: false,
    share: link.shareId,
    until: link.expiresAt,
  });
});

test("expired link is refused with expired", async () => {
  const link = await share();
  expect(await asGuest(link.token, {}, link.expiresAt)).toEqual({ ok: false, code: "expired" });
});

test("revoked share token cannot get a room token", async () => {
  const link = await share();
  await svc().revokeShare(link.shareId, actor);
  expect(await asGuest(link.token)).toEqual({ ok: false, code: "unavailable" });
});

test("31st request in 10 minutes from one IP is rate_limited", async () => {
  const { token } = await share();
  const from = { ip: "10.8.8.8" };
  for (let i = 0; i < 30; i++) expect((await asGuest(token, from)).ok).toBe(true);
  expect(await asGuest(token, from)).toEqual({ ok: false, code: "rate_limited" });
});

test("guest token ttl never outlives the link", async () => {
  const now = Date.now();
  const link = await share("edit", now + 61_000, now);
  const res = await asGuest(link.token, {}, now + 1000);
  if (!res.ok) throw new Error(res.code);
  const claims = (await verifyRoomToken(SECRET, res.token, now + 1000)) as unknown as { e: number };
  expect(claims.e).toBeLessThanOrEqual(Math.floor(link.expiresAt / 1000));
});
