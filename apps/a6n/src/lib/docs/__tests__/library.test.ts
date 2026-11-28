import { env } from "cloudflare:test";
import { verifyRoomToken } from "@foundry/collab/token";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { actorOf, freshId, insertUser, TEST_ORG } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { depsFor } from "../../deps";
import { ME, rows, seed } from "../../meeting-docs/__tests__/seed";
import { issueStaffRoomToken } from "../../meeting-docs/room-token";
import { createMeetingDocsService } from "../../meeting-docs/service";
import { resolveShare } from "../../meeting-docs/share-link";
import { createDocsLibrary } from "../library";
import { isDocOpen } from "../meta";
import { createDocsService } from "../service";

const SECRET = "a6n-collab-test-secret-a6n-collab-test";
const me = { userId: ME, name: "Sam" };
const stale = { ok: false, code: "stale" };
const later = () => Date.now() + 3_600_000;
const db = () => depsFor(env).db;
const actor = (userId: string, role: "member" | "owner" = "member") => actorOf(userId, "x", role);
const lib = (userId: string, role: "member" | "owner" = "member") => createDocsLibrary(db(), actor(userId, role), depsFor(env).rooms, depsFor(env).archive);
const docs = () => createDocsService(db(), TEST_ORG, ME, depsFor(env).rooms);
const meetings = () => createMeetingDocsService(db(), TEST_ORG, depsFor(env).rooms);
let other = "";
let boss = "";

beforeAll(applyMigrations);
beforeEach(async () => {
  await seed();
  other = await insertUser(`o-${freshId()}@x.io`, "member");
  boss = await insertUser(`b-${freshId()}@x.io`, "owner");
});

const meetingDoc = async () => {
  const r = await meetings().start("inq_md", "2026-11-28", me);
  if (!r.ok) throw new Error(r.code);
  return r.id;
};

test("lists own, shared and inquiry docs with their type, and never another member's", async () => {
  const mine = (await docs().create(me, "brainstorm")).id;
  const client = await meetingDoc();
  expect((await lib(ME).list()).items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: mine, kind: "brainstorm", source: "mine" }),
      expect.objectContaining({ id: client, kind: "client", source: "inquiry", inquiryId: "inq_md" }),
    ]),
  );
  expect((await lib(boss, "owner").list()).items.map((i) => i.id)).toEqual([client]);
  await docs().setMember(mine, other, "view", me);
  const shared = (await lib(other).list()).items.find((i) => i.id === mine)!;
  expect(shared).toMatchObject({ source: "shared", access: "view", sharedWith: 0 });
  expect(Object.values(shared.can).some(Boolean)).toBe(false);
});

test("only the owner manages their doc", async () => {
  const { id } = await docs().create(me);
  await docs().setMember(id, other, "edit", me);
  for (const who of [lib(other), lib(boss, "owner")]) {
    for (const res of [await who.rename(id, "x"), await who.setKind(id, "client"), await who.duplicate(id), await who.trash(id), await who.restore(id)]) {
      expect(res).toEqual(stale);
    }
  }
  expect(await lib(ME).rename(id, "  Pricing  ")).toEqual({ ok: true });
  expect(await lib(ME).rename(id, " ")).toEqual({ ok: false, code: "invalid" });
  expect(await lib(ME).setKind(id, "client")).toEqual({ ok: true });
  expect((await lib(ME).list()).items[0]).toMatchObject({ title: "Pricing", kind: "client" });
});

test("trash closes every way in, keeps every row, and restore brings access back", async () => {
  const { id } = await docs().create(me, "brainstorm");
  await docs().setMember(id, other, "edit", me);
  const link = await docs().links.createShare(id, { mode: "edit", expiresAt: later() }, me);
  if (!link.ok) throw new Error(link.code);
  expect(await lib(ME).trash(id)).toEqual({ ok: true });
  expect(await isDocOpen(db(), id)).toBe(false);
  expect(await docs().get(id)).toBeNull();
  for (const who of [ME, other]) expect(await issueStaffRoomToken(db(), SECRET, actor(who), id)).toEqual(stale);
  expect(await resolveShare(db(), link.token)).toEqual({ status: "unavailable" });
  expect(await docs().links.createShare(id, { mode: "view", expiresAt: later() }, me)).toEqual(stale);
  expect((await lib(other).list()).items).toEqual([]);
  expect((await lib(other).list()).trash).toEqual([]);
  expect((await lib(ME).list()).trash).toMatchObject([{ id, trashed: true, kind: "brainstorm" }]);
  for (const t of ["collab_docs", "doc_members", "collab_shares"]) expect((await rows(`select id from ${t}`)).length).toBe(1);
  expect(await lib(ME).restore(id)).toEqual({ ok: true });
  const res = await issueStaffRoomToken(db(), SECRET, actor(other), id);
  expect(res.ok && (await verifyRoomToken(SECRET, res.token))?.edit).toBe(true);
  expect(await resolveShare(db(), link.token)).toMatchObject({ status: "ok" });
  expect((await lib(ME).list()).items[0]).toMatchObject({ kind: "brainstorm" });
});

test("a room that cannot be reached leaves the doc where it was", async () => {
  const { id } = await docs().create(me);
  const down = createDocsLibrary(db(), actor(ME), {
    revoke: async () => {},
    closeAll: async () => {
      throw new Error("room unreachable");
    },
  }, depsFor(env).archive);
  await expect(down.trash(id)).rejects.toThrow("room unreachable");
  expect(await isDocOpen(db(), id)).toBe(true);
});

test("duplicate copies the text into a new doc of yours, without people or links", async () => {
  const { id } = await docs().create(me, "brainstorm");
  await env.DB.prepare("update collab_docs set snapshot = 'c25hcA==', text = 'hello' where id = ?").bind(id).run();
  await docs().setMember(id, other, "edit", me);
  const copy = await lib(ME).duplicate(id);
  if (!copy.ok) throw new Error(copy.code);
  expect(await rows("select title, text, snapshot, owner_ref from collab_docs where id = ?", copy.id)).toEqual([
    { title: "Untitled copy", text: "hello", snapshot: "c25hcA==", owner_ref: `user:${ME}` },
  ]);
  expect((await lib(ME).list()).items.find((i) => i.id === copy.id)).toMatchObject({ kind: "brainstorm", sharedWith: 0 });
});

test("inquiry docs: readers only open them, writers rename, trash and restore, nobody retypes or copies", async () => {
  const id = await meetingDoc();
  const reader = createDocsLibrary(db(), { ...actor(other), permissions: ["inquiry:read"] }, depsFor(env).rooms, depsFor(env).archive);
  expect(await reader.trash(id)).toEqual(stale);
  expect(await createDocsLibrary(db(), { ...actor(other), permissions: [] }, depsFor(env).rooms, depsFor(env).archive).list()).toEqual({ items: [], trash: [] });
  expect(await lib(other).setKind(id, "notes")).toEqual(stale);
  expect(await lib(other).duplicate(id)).toEqual(stale);
  expect(await lib(other).rename(id, "Kickoff")).toEqual({ ok: true });
  expect(await lib(other).trash(id)).toEqual({ ok: true });
  expect(await meetings().listForInquiry("inq_md")).toEqual([]);
  expect(await meetings().get(id)).toBeNull();
  expect(await issueStaffRoomToken(db(), SECRET, actor(ME), id)).toEqual(stale);
  expect((await reader.list()).trash).toEqual([]);
  expect(await lib(other).restore(id)).toEqual({ ok: true });
  expect(await meetings().listForInquiry("inq_md")).toMatchObject([{ id, title: "Kickoff" }]);
});

const archived = (id: string) => env.DOC_ARCHIVE.getByName(TEST_ORG).get(id);

test("delete forever and empty trash move the doc to the archive: gone from the database and the app", async () => {
  const [one, two, kept] = [(await docs().create(me, "brainstorm")).id, (await docs().create(me)).id, (await docs().create(me)).id];
  await env.DB.prepare("update collab_docs set snapshot = 'c25hcA==', text = 'hello' where id = ?").bind(one).run();
  await docs().setMember(one, other, "edit", me);
  await docs().links.createShare(one, { mode: "view", expiresAt: later() }, me);
  expect(await lib(ME).deleteForever(one)).toEqual(stale);
  await lib(ME).trash(one);
  await lib(ME).trash(two);
  expect(await lib(other).deleteForever(one)).toEqual(stale);
  expect(await lib(ME).deleteForever(one)).toEqual({ ok: true });
  expect(await archived(one)).toMatchObject({
    title: "Untitled",
    kind: "brainstorm",
    text: "hello",
    snapshot: "c25hcA==",
    archivedBy: ME,
    members: [{ userId: other, mode: "edit" }],
    links: [{ mode: "view" }],
  });
  for (const t of ["doc_meta", "doc_members", "collab_shares"]) expect(await rows(`select id from ${t} where doc_id = ?`, one)).toEqual([]);
  expect(await lib(ME).restore(one)).toEqual(stale);
  expect(await lib(ME).emptyTrash()).toEqual({ ok: true, count: 1 });
  expect(await archived(two)).not.toBeNull();
  const after = await lib(ME).list();
  expect(after.trash).toEqual([]);
  expect(after.items.map((i) => i.id)).toEqual([kept]);
  expect((await lib(other).list()).items).toEqual([]);
  expect(await isDocOpen(db(), one)).toBe(false);
  expect(await rows("select id from collab_docs")).toEqual([{ id: kept }]);
});

test("only workspace owners and admins delete an inquiry doc forever, and empty trash leaves what the actor may not delete", async () => {
  const id = await meetingDoc();
  await lib(other).trash(id);
  expect(await lib(other).deleteForever(id)).toEqual(stale);
  expect(await lib(other).emptyTrash()).toEqual({ ok: true, count: 0 });
  expect(await lib(boss, "owner").deleteForever(id)).toEqual({ ok: true });
  expect((await lib(boss, "owner").list()).trash).toEqual([]);
});

test("an archive that cannot be written leaves the doc in Trash", async () => {
  const { id } = await docs().create(me);
  await lib(ME).trash(id);
  const down = createDocsLibrary(db(), actor(ME), depsFor(env).rooms, {
    put: async () => {
      throw new Error("archive unreachable");
    },
  });
  await expect(down.deleteForever(id)).rejects.toThrow("archive unreachable");
  expect((await lib(ME).list()).trash).toMatchObject([{ id }]);
});

test("a doc that changed while it was being archived stays in Trash", async () => {
  const { id } = await docs().create(me);
  await lib(ME).trash(id);
  const late = createDocsLibrary(db(), actor(ME), depsFor(env).rooms, {
    // a save that lands between the copy and the delete: the copy is out of date
    put: async () => {
      await env.DB.prepare("update collab_docs set text = 'late', updated_at = updated_at + 1 where id = ?").bind(id).run();
    },
  });
  expect(await late.deleteForever(id)).toEqual(stale);
  expect(await rows("select text from collab_docs where id = ?", id)).toEqual([{ text: "late" }]);
  expect(await lib(ME).deleteForever(id)).toEqual({ ok: true });
  expect(await archived(id)).toMatchObject({ text: "late" });
});

test("a doc restored, shared and trashed again while it was being archived keeps its rows", async () => {
  const { id } = await docs().create(me);
  await lib(ME).trash(id);
  const late = createDocsLibrary(db(), actor(ME), depsFor(env).rooms, {
    put: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await lib(ME).restore(id);
      await docs().setMember(id, other, "edit", me);
      await lib(ME).trash(id);
    },
  });
  expect(await late.deleteForever(id)).toEqual(stale);
  expect(await rows("select user_id from doc_members where doc_id = ?", id)).toEqual([{ user_id: other }]);
});
