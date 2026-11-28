import { env } from "cloudflare:test";
import { hashShareToken } from "@foundry/collab/token";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { insertOrg, TEST_ORG } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { createMeetingDocsService } from "../service";
import { ME, rows, seed } from "./seed";

const rooms = { revoke: vi.fn(async () => {}) };
const svc = (org = TEST_ORG) => createMeetingDocsService(getDb(env), org, rooms);
const actor = { userId: ME, name: "me@x.io" };
const HOUR = 3_600_000;

const start = async () => {
  const r = await svc().start("inq_md", "2026-11-28", actor);
  if (!r.ok) throw new Error(r.code);
  return r.id;
};
const share = async (docId: string, expiresAt = Date.now() + HOUR) => {
  const r = await svc().createShare(docId, { mode: "edit", expiresAt }, actor);
  if (!r.ok) throw new Error(r.code);
  return r;
};

beforeAll(applyMigrations);
beforeEach(async () => {
  await seed();
  rooms.revoke.mockClear();
});

describe("meeting docs service", () => {
  test("start creates a doc titled from the contact and logs doc_started", async () => {
    const id = await start();
    expect(await rows("select title, owner_ref, default_link_ttl_seconds ttl, created_by from collab_docs where id = ?", id)).toEqual([
      { title: "Meeting with Ana - 2026-11-28", owner_ref: "inquiry:inq_md", ttl: 604800, created_by: ME },
    ]);
    expect(await rows("select type, note, actor_id from inquiry_activities")).toEqual([
      { type: "doc_started", note: "Meeting with Ana - 2026-11-28", actor_id: ME },
    ]);
    expect(await svc().listForInquiry("inq_md")).toMatchObject([
      { id, title: "Meeting with Ana - 2026-11-28", createdByName: "me@x.io", hasContent: false, activeShares: 0 },
    ]);
    expect(await svc().get(id)).toMatchObject({ id, inquiryId: "inq_md", contactName: "Ana" });
  });

  test("org B cannot start, list, open or share org A docs", async () => {
    const id = await start();
    const { shareId } = await share(id);
    rooms.revoke.mockClear();
    const b = svc(await insertOrg());
    const stale = { ok: false, code: "stale" };
    const later = Date.now() + HOUR;
    expect(await b.start("inq_md", "2026-11-28", actor)).toEqual(stale);
    expect(await b.createShare(id, { mode: "edit", expiresAt: later }, actor)).toEqual(stale);
    expect(await b.setDefaultTtl(id, 86400, actor)).toEqual(stale);
    expect(await b.revokeShare(shareId, actor)).toEqual(stale);
    expect(await b.setShareExpiry(shareId, later, actor)).toEqual(stale);
    expect(await b.listForInquiry("inq_md")).toEqual([]);
    expect(await b.listShares(id)).toEqual([]);
    expect(await b.get(id)).toBeNull();
    expect(rooms.revoke).not.toHaveBeenCalled();
    expect(await rows("select count(*) n from collab_docs")).toEqual([{ n: 1 }]);
  });

  test("createShare stores only the hash", async () => {
    const id = await start();
    const { token } = await share(id);
    const [row] = await rows<Record<string, unknown>>("select * from collab_shares");
    expect(row!.token_hash).toBe(await hashShareToken(token));
    expect(Object.values(row!)).not.toContain(token);
    expect(await svc().listShares(id)).toMatchObject([{ mode: "edit", revokedAt: null, createdByName: "me@x.io" }]);
    expect((await svc().listForInquiry("inq_md"))[0]!.activeShares).toBe(1);
  });

  test("createShare requires an expiry within bounds", async () => {
    const id = await start();
    const now = Date.now();
    const at = (expiresAt: number) => svc().createShare(id, { mode: "view", expiresAt }, actor, now);
    expect(await at(now + 30_000)).toEqual({ ok: false, code: "invalid" });
    expect(await at(now + 366 * 86_400_000)).toEqual({ ok: false, code: "invalid" });
    expect(await at(now + HOUR)).toMatchObject({ ok: true });
  });

  test("setDefaultTtl accepts only presets", async () => {
    const id = await start();
    expect(await svc().setDefaultTtl(id, 86400, actor)).toEqual({ ok: true });
    expect(await svc().setDefaultTtl(id, 1234, actor)).toEqual({ ok: false, code: "invalid" });
    expect((await svc().get(id))!.defaultLinkTtlSeconds).toBe(86400);
  });

  test("setShareExpiry updates and drops live sockets", async () => {
    const id = await start();
    const { shareId } = await share(id);
    const expiresAt = Date.now() + 2 * HOUR;
    expect(await svc().setShareExpiry(shareId, expiresAt, actor)).toEqual({ ok: true });
    expect(await rows("select expires_at from collab_shares")).toEqual([{ expires_at: expiresAt }]);
    expect(rooms.revoke).toHaveBeenCalledWith(id, shareId);
  });

  test("revokeShare sets revoked_at and drops live sockets; twice is stale", async () => {
    const id = await start();
    const { shareId } = await share(id);
    expect(await svc().revokeShare(shareId, actor)).toEqual({ ok: true });
    expect((await svc().listShares(id))[0]!.revokedAt).toEqual(expect.any(Number));
    expect(rooms.revoke).toHaveBeenCalledWith(id, shareId);
    expect(await svc().revokeShare(shareId, actor)).toEqual({ ok: false, code: "stale" });
    // a retry still drops sockets, in case the first drop failed
    expect(rooms.revoke).toHaveBeenCalledTimes(2);
    expect(await svc().setShareExpiry(shareId, Date.now() + HOUR, actor)).toEqual({ ok: false, code: "stale" });
  });
});
