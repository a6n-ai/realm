import { env } from "cloudflare:test";
import type { CollabEvent } from "@foundry/collab/server";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { TEST_ORG } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { isShareActive, loadSnapshot, recordRoomEvent, saveSnapshot } from "../room-store";
import { createMeetingDocsService } from "../service";
import { ME, rows, seed } from "./seed";

const db = () => getDb(env);
const actor = { userId: ME, name: "me@x.io" };
const svc = () => createMeetingDocsService(db(), TEST_ORG, { revoke: async () => {} });
const HOUR = 3_600_000;
let docId = "";

const guest = (type: CollabEvent["type"], name = "Ana"): CollabEvent => ({ type, sub: `guest:csh_1:${name}`, name, guest: true });
const staff = (type: CollabEvent["type"]): CollabEvent => ({ type, sub: ME, name: "me@x.io", guest: false });
const logged = () => rows("select type, note, actor_id from inquiry_activities where type != 'doc_started' order by created_at, type");

beforeAll(applyMigrations);
beforeEach(async () => {
  await seed();
  const r = await svc().start("inq_md", "2026-11-28", actor);
  if (!r.ok) throw new Error(r.code);
  docId = r.id;
});

describe("snapshots", () => {
  test("save then load round-trips bytes and stores text", async () => {
    expect(await loadSnapshot(db(), docId)).toBeNull();
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
    await saveSnapshot(db(), docId, bytes, "x".repeat(300_000));
    expect(await loadSnapshot(db(), docId)).toEqual(bytes);
    expect(await rows("select length(text) n from collab_docs")).toEqual([{ n: 200_000 }]);
    expect((await svc().get(docId))!.hasContent).toBe(true);
  });
});

describe("room events", () => {
  test("guest join logs doc_joined with the guest name", async () => {
    await recordRoomEvent(db(), docId, guest("joined"));
    expect(await logged()).toEqual([{ type: "doc_joined", note: "Ana", actor_id: null }]);
  });

  test("staff join logs nothing", async () => {
    await recordRoomEvent(db(), docId, staff("joined"));
    expect(await logged()).toEqual([]);
  });

  test("edit by staff logs doc_edited with actor", async () => {
    await recordRoomEvent(db(), docId, staff("edited"));
    expect(await logged()).toEqual([{ type: "doc_edited", note: "me@x.io", actor_id: ME }]);
  });

  test("edit by guest logs doc_edited without actor", async () => {
    // a guest sub that happens to equal a member id must not be attributed to that member
    await recordRoomEvent(db(), docId, { ...guest("edited"), sub: ME });
    expect(await logged()).toEqual([{ type: "doc_edited", note: "Ana", actor_id: null }]);
  });

  test("repeats inside the window write no row, later ones and other people do", async () => {
    const now = Date.now();
    await recordRoomEvent(db(), docId, guest("joined"), now);
    await recordRoomEvent(db(), docId, guest("joined"), now + HOUR - 1000);
    await recordRoomEvent(db(), docId, guest("joined", "Bo"), now + 1);
    await recordRoomEvent(db(), docId, guest("edited"), now + 2);
    await recordRoomEvent(db(), docId, guest("edited"), now + 9 * 60_000);
    expect(await logged()).toHaveLength(3);
    await recordRoomEvent(db(), docId, guest("edited"), now + 11 * 60_000);
    await recordRoomEvent(db(), docId, guest("joined"), now + HOUR + 1000);
    expect(await logged()).toHaveLength(5);
  });

  test("an unknown doc writes nothing", async () => {
    await recordRoomEvent(db(), "cdc_nope", guest("joined"));
    expect(await logged()).toEqual([]);
  });
});

describe("isShareActive", () => {
  const share = async (expiresAt: number) => {
    const r = await svc().createShare(docId, { mode: "edit", expiresAt }, actor);
    if (!r.ok) throw new Error(r.code);
    return r.shareId;
  };

  test("accepts a live share whose token does not outlive it", async () => {
    const at = Date.now() + HOUR;
    expect(await isShareActive(db(), docId, await share(at), at)).toBe(true);
  });

  test("refuses revoked, expired, shortened, unknown and other-doc shares", async () => {
    const at = Date.now() + HOUR;
    const id = await share(at);
    expect(await isShareActive(db(), docId, id, at, at)).toBe(false);
    expect(await isShareActive(db(), docId, id, at + 1)).toBe(false);
    expect(await isShareActive(db(), docId, id, null)).toBe(false);
    expect(await isShareActive(db(), "cdc_other", id, at)).toBe(false);
    expect(await isShareActive(db(), docId, "csh_nope", at)).toBe(false);
    await svc().revokeShare(id, actor);
    expect(await isShareActive(db(), docId, id, at)).toBe(false);
  });
});
