import { env, evictDurableObject, runInDurableObject } from "cloudflare:test";
import { signRoomToken, type RoomClaims } from "@foundry/collab/token";
import * as encoding from "lib0/encoding";
import { beforeAll, beforeEach, expect, test } from "vitest";
import * as Y from "yjs";
import { connectRoom } from "../../../../test/collab-client";
import { TEST_ORG } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { saveSnapshot } from "../room-store";
import { createMeetingDocsService } from "../service";
import { ME, rows, seed } from "./seed";

const SECRET = "a6n-collab-test-secret-a6n-collab-test";
const actor = { userId: ME, name: "me@x.io" };
const svc = () => createMeetingDocsService(getDb(env), TEST_ORG, { revoke: async () => {} });
const HOUR = 3_600_000;
let docId = "";

const claims = (over: Partial<RoomClaims> = {}): RoomClaims => ({
  doc: docId,
  sub: ME,
  name: "me@x.io",
  edit: true,
  share: null,
  until: null,
  ...over,
});
const token = (over: Partial<RoomClaims> = {}) => signRoomToken(SECRET, claims(over));

async function guest(over: Partial<RoomClaims> = {}) {
  const expiresAt = Date.now() + HOUR;
  const made = await svc().createShare(docId, { mode: "edit", expiresAt }, actor);
  if (!made.ok) throw new Error(made.code);
  const full = { sub: `guest:${made.shareId}:ana`, name: "Ana", share: made.shareId, until: expiresAt, ...over };
  return { shareId: made.shareId, token: await token(full) };
}

async function join(roomToken: string) {
  const client = await connectRoom(docId, roomToken);
  await client.synced;
  return client;
}

function write(doc: Y.Doc, words: string) {
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(words)]);
  const block = new Y.XmlElement("blockContainer");
  block.insert(0, [paragraph]);
  const fragment = doc.getXmlFragment("document-store");
  fragment.insert(fragment.length, [block]);
}
const content = (doc: Y.Doc) => doc.getXmlFragment("document-store").toString();
const saved = async () =>
  (await rows<{ text: string | null; snapshot: string | null }>("select text, snapshot from collab_docs where id = ?", docId))[0]!;
const settle = () => new Promise((resolve) => setTimeout(resolve, 1000));

beforeAll(applyMigrations);
beforeEach(async () => {
  await seed();
  const r = await svc().start("inq_md", "2026-11-28", actor);
  if (!r.ok) throw new Error(r.code);
  docId = r.id;
});

test("no token is refused with 401", async () => {
  expect((await connectRoom(docId, "")).status).toBe(401);
});

test("a token for another doc is refused with 403", async () => {
  expect((await connectRoom(docId, await token({ doc: "cdc_other" }))).status).toBe(403);
});

test("a foreign Origin is refused with 403", async () => {
  expect((await connectRoom(docId, await token(), "https://evil.example")).status).toBe(403);
});

test("two editors converge", async () => {
  const a = await join(await token());
  const b = await join((await guest()).token);
  write(a.doc, "from staff");
  write(b.doc, "from guest");
  await expect.poll(() => content(b.doc)).toContain("from staff");
  await expect.poll(() => content(a.doc)).toContain("from guest");
  a.close();
  b.close();
});

test("a view-only connection cannot change the doc", async () => {
  const editor = await join(await token());
  const viewer = await join((await guest({ edit: false })).token);
  write(editor.doc, "allowed");
  write(viewer.doc, "forbidden");
  await settle();
  expect(content(editor.doc)).not.toContain("forbidden");
  await expect.poll(() => content(viewer.doc)).toContain("allowed");
  viewer.close();
  editor.close();
  await expect.poll(async () => (await saved()).text).toContain("allowed");
  expect((await saved()).text).not.toContain("forbidden");
});

// the poll gives up after 1 s, before the 2 s debounce, so only the disconnect save can satisfy it
test("last disconnect saves snapshot and text", async () => {
  const a = await join(await token());
  const b = await join(await token());
  write(a.doc, "typed words");
  await expect.poll(() => content(b.doc)).toContain("typed words");
  a.close();
  b.close();
  await expect.poll(async () => (await saved()).text, { timeout: 1000 }).toBe("typed words");
  expect((await saved()).snapshot).not.toBeNull();
});

test("a fresh room loads the saved snapshot", async () => {
  const stored = new Y.Doc();
  write(stored, "from storage");
  await saveSnapshot(getDb(env), docId, Y.encodeStateAsUpdate(stored), "from storage");
  const client = await join(await token());
  expect(content(client.doc)).toContain("from storage");
  client.close();
});

test("revoke closes the guest socket with 4403 and leaves staff connected", async () => {
  const staff = await join(await token());
  const g = await guest();
  const visitor = await join(g.token);
  expect(await env.COLLAB_ROOM.getByName(docId).revoke(g.shareId)).toBe(1);
  expect(await visitor.closed).toEqual({ code: 4403 });
  write(staff.doc, "still here");
  const other = await join(await token());
  await expect.poll(() => content(other.doc)).toContain("still here");
  staff.close();
  other.close();
});

test("a revoked share cannot rejoin with a token that is still valid", async () => {
  const stored = new Y.Doc();
  write(stored, "secret notes");
  await saveSnapshot(getDb(env), docId, Y.encodeStateAsUpdate(stored), "secret notes");
  const g = await guest();
  await svc().revokeShare(g.shareId, actor);
  const client = await connectRoom(docId, g.token);
  expect(await client.closed).toEqual({ code: 4403 });
  expect(content(client.doc)).not.toContain("secret notes");
});

test("a message after until closes with 4403", async () => {
  const visitor = await join((await guest({ until: Date.now() + 1000 })).token);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  // the room's alarm may have closed the socket already; either way nothing written now may land
  if (visitor.ws!.readyState === 1) write(visitor.doc, "too late");
  expect(await visitor.closed).toEqual({ code: 4403 });
  const other = await join(await token());
  expect(content(other.doc)).not.toContain("too late");
  other.close();
});

test("a silent expired viewer is dropped before anyone else's change reaches it", async () => {
  const staff = await join(await token());
  const viewer = await join((await guest({ edit: false, until: Date.now() + 1000 })).token);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  write(staff.doc, "after expiry");
  expect(await viewer.closed).toEqual({ code: 4403 });
  expect(content(viewer.doc)).not.toContain("after expiry");
  staff.close();
});

test("guest join writes one doc_joined row per hour", async () => {
  const g = await guest();
  const joined = () => rows("select note from inquiry_activities where type = 'doc_joined'");
  (await join(g.token)).close();
  await expect.poll(joined).toHaveLength(1);
  (await join(g.token)).close();
  await settle();
  expect(await joined()).toEqual([{ note: "Ana" }]);
});

test("an edit is logged once, under the signed name", async () => {
  const visitor = await join((await guest()).token);
  write(visitor.doc, "one");
  write(visitor.doc, "two");
  await expect
    .poll(() => rows("select note, actor_id from inquiry_activities where type = 'doc_edited'"))
    .toEqual([{ note: "Ana", actor_id: null }]);
  visitor.close();
});

test("oversized message closes with 1009", async () => {
  const client = await join(await token());
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  encoding.writeVarUint(encoder, 2);
  encoding.writeVarUint8Array(encoder, new Uint8Array(300_000));
  client.ws!.send(encoding.toUint8Array(encoder));
  expect(await client.closed).toEqual({ code: 1009 });
});

test("a flood of messages closes with 4429", async () => {
  const client = await join(await token());
  for (let i = 0; i < 700; i++) client.ws!.send(new Uint8Array([3]));
  expect(await client.closed).toEqual({ code: 4429 });
});

// hibernation drops the room's memory but keeps the sockets, and the browser provider sends no presence heartbeat
const hibernate = () => evictDurableObject(env.COLLAB_ROOM.getByName(docId));

test("after hibernation a newcomer makes the room ask the others to re-announce", async () => {
  const first = await join(await token());
  first.announce("Sam");
  await settle();
  await hibernate();
  const second = await join((await guest()).token);
  await expect.poll(() => first.messages).toContainEqual({ type: "who" });
  expect(second.messages).not.toContainEqual({ type: "who" });
  first.close();
  second.close();
});

test("after hibernation the others still learn that someone left", async () => {
  const staff = await join(await token());
  const visitor = await join((await guest()).token);
  visitor.announce("Ana");
  await settle();
  await hibernate();
  visitor.close();
  await expect.poll(() => staff.messages).toContainEqual({ type: "left", clients: [visitor.doc.clientID] });
  staff.close();
});

test("a person who already reconnected is not reported as gone", async () => {
  const staff = await join(await token());
  const g = await guest();
  const old = await join(g.token);
  old.announce("Ana");
  await settle();
  await hibernate();
  const again = await connectRoom(docId, g.token);
  await again.synced;
  // the same browser tab keeps its Yjs client id across a reconnect
  again.doc.clientID = old.doc.clientID;
  again.announce("Ana");
  await settle();
  old.close();
  await settle();
  expect(staff.messages.filter((m) => (m as { type: string }).type === "left")).toEqual([]);
  staff.close();
  again.close();
});

test("edits made before hibernation are still there afterwards", async () => {
  const staff = await join(await token());
  write(staff.doc, "kept across sleep");
  await expect.poll(async () => (await saved()).text, { timeout: 5000 }).toBe("kept across sleep");
  await hibernate();
  const other = await join(await token());
  expect(content(other.doc)).toContain("kept across sleep");
  staff.close();
  other.close();
});

test("an idle guest is dropped when the link expires, with no traffic at all, even from a sleeping room", async () => {
  const staff = await join(await token());
  const late = await join((await guest({ until: Date.now() + 60_000 })).token);
  const soon = await join((await guest({ until: Date.now() + 1500 })).token);
  await hibernate();
  expect(await soon.closed).toEqual({ code: 4403 });
  // the next expiry is scheduled, and nobody else was dropped
  await runInDurableObject(env.COLLAB_ROOM.getByName(docId), async (_room, state) => {
    expect(await state.storage.getAlarm()).toBeGreaterThan(Date.now() + 30_000);
  });
  expect(late.ws!.readyState).toBe(1);
  staff.close();
  late.close();
});
