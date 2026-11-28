import { env } from "cloudflare:test";
import { verifyRoomToken } from "@foundry/collab/token";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { actorOf, freshId, insertUser, TEST_ORG } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { depsFor } from "../../deps";
import { ME, rows, seed } from "../../meeting-docs/__tests__/seed";
import { issueStaffRoomToken } from "../../meeting-docs/room-token";
import { isShareActive } from "../../meeting-docs/room-store";
import { createMeetingDocsService } from "../../meeting-docs/service";
import { createDocsService } from "../service";

const SECRET = "a6n-collab-test-secret-a6n-collab-test";
const me = { userId: ME, name: "Sam" };
const stale = { ok: false, code: "stale" };
const later = () => Date.now() + 3_600_000;
const db = () => depsFor(env).db;
const svc = (userId: string) => createDocsService(db(), TEST_ORG, userId, depsFor(env).rooms);
const token = (userId: string, docId: string) => issueStaffRoomToken(db(), SECRET, actorOf(userId, "x", "member"), docId);
const claims = async (userId: string, docId: string) => {
  const res = await token(userId, docId);
  if (!res.ok) throw new Error(res.code);
  return (await verifyRoomToken(SECRET, res.token))!;
};
let other = "";
let boss = "";

beforeAll(applyMigrations);
beforeEach(async () => {
  await seed();
  other = await insertUser(`o-${freshId()}@x.io`, "member");
  boss = await insertUser(`b-${freshId()}@x.io`, "owner");
});

test("a new doc is private, owners included", async () => {
  const { id } = await svc(ME).create(me);
  expect(await svc(ME).get(id)).toMatchObject({ title: "Untitled", access: "owner" });
  expect(await svc(ME).listMine()).toMatchObject([{ id, sharedWith: 0, activeLinks: 0 }]);
  for (const who of [other, boss]) {
    expect(await svc(who).get(id)).toBeNull();
    expect(await svc(who).listShared()).toEqual([]);
    expect(await token(who, id)).toEqual(stale);
    expect(await svc(who).members(id)).toBeNull();
    expect(await svc(who).rename(id, "x", me)).toEqual(stale);
    expect(await svc(who).remove(id)).toEqual(stale);
    expect(await svc(who).setMember(id, other, "edit", me)).toEqual(stale);
    expect(await svc(who).removeMember(id, other)).toEqual(stale);
    expect(await svc(who).links.createShare(id, { mode: "view", expiresAt: later() }, me)).toEqual(stale);
    expect(await svc(who).links.listShares(id)).toEqual([]);
  }
});

test("changing or removing access ends the old grant", async () => {
  const { id } = await svc(ME).create(me);
  await svc(ME).setMember(id, other, "view", me);
  const first = await claims(other, id);
  expect(first).toMatchObject({ edit: false, share: expect.stringMatching(/^dmb_/), until: null });
  expect(await isShareActive(db(), id, first.share!, null)).toBe(true);
  expect(await svc(other).listShared()).toMatchObject([{ id, access: "view" }]);
  expect(await svc(ME).members(id)).toMatchObject({ grants: [{ userId: other, mode: "view" }] });
  await svc(ME).setMember(id, other, "edit", me);
  const second = await claims(other, id);
  expect(second.edit).toBe(true);
  expect(await isShareActive(db(), id, first.share!, null)).toBe(false);
  expect(await svc(ME).removeMember(id, other)).toEqual({ ok: true });
  expect(await isShareActive(db(), id, second.share!, null)).toBe(false);
  expect(await token(other, id)).toEqual(stale);
});

test("leaving the workspace ends access", async () => {
  const { id } = await svc(ME).create(me);
  await svc(ME).setMember(id, other, "edit", me);
  const before = await claims(other, id);
  await env.DB.prepare("delete from members where user_id = ?").bind(other).run();
  expect(await svc(other).listShared()).toEqual([]);
  expect(await token(other, id)).toEqual(stale);
  expect(await isShareActive(db(), id, before.share!, null)).toBe(false);
});

test("delete removes the doc, its grants and links, and ends the creator's grant", async () => {
  const { id } = await svc(ME).create(me);
  await svc(ME).setMember(id, other, "edit", me);
  await svc(ME).links.createShare(id, { mode: "view", expiresAt: later() }, me);
  expect(await isShareActive(db(), id, `own:${ME}`, null)).toBe(true);
  expect(await svc(ME).remove(id)).toEqual({ ok: true });
  for (const t of ["collab_docs", "doc_members", "collab_shares"]) expect(await rows(`select id from ${t}`)).toEqual([]);
  expect(await isShareActive(db(), id, `own:${ME}`, null)).toBe(false);
});

test.each(["", "   ", "x".repeat(201)])("rejects the title %j", async (title) => {
  const { id } = await svc(ME).create(me);
  expect(await svc(ME).rename(id, title, me)).toEqual({ ok: false, code: "invalid" });
});

test("sharing with yourself or a non-member is invalid", async () => {
  const { id } = await svc(ME).create(me);
  for (const who of [ME, "usr_nobody"]) expect(await svc(ME).setMember(id, who, "edit", me)).toEqual({ ok: false, code: "invalid" });
});

test("a meeting doc token needs inquiry:read", async () => {
  const started = await createMeetingDocsService(db(), TEST_ORG, depsFor(env).rooms).start("inq_md", "2026-11-28", me);
  if (!started.ok) throw new Error(started.code);
  const nobody = { ...actorOf(ME, "Sam", "member"), permissions: [] };
  expect(await issueStaffRoomToken(db(), SECRET, nobody, started.id)).toEqual(stale);
});
