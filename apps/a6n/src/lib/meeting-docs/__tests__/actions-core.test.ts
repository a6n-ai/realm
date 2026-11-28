import { env } from "cloudflare:test";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { actorOf } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { depsFor } from "../../deps";
import { runCreateShare, runRevokeShare, runSetDefaultTtl, runSetShareExpiry, runStartDoc } from "../actions-core";
import { ME, seed } from "./seed";

const member = actorOf(ME, "Sam", "member");
const reader = { ...member, permissions: ["inquiry:read" as const] };
const deps = () => depsFor(env);
const later = () => Date.now() + 3_600_000;

beforeAll(applyMigrations);
beforeEach(seed);

const start = async () => {
  const r = await runStartDoc(member, deps(), { inquiryId: "inq_md", localDate: "2026-11-28" });
  if (!r.ok) throw new Error(r.code);
  return r.id;
};

test("member without inquiry:update cannot start, share, expire or revoke", async () => {
  const forbidden = { ok: false, code: "forbidden" };
  expect(await runStartDoc(reader, deps(), { inquiryId: "inq_md", localDate: "2026-11-28" })).toEqual(forbidden);
  expect(await runCreateShare(reader, deps(), { docId: "cdc_x", mode: "edit", expiresAt: later() })).toEqual(forbidden);
  expect(await runSetShareExpiry(reader, deps(), { shareId: "csh_x", expiresAt: later() })).toEqual(forbidden);
  expect(await runRevokeShare(reader, deps(), { shareId: "csh_x" })).toEqual(forbidden);
  expect(await runSetDefaultTtl(reader, deps(), { docId: "cdc_x", seconds: 86400 })).toEqual(forbidden);
});

test("createShare returns an /m/ url with a 43-char token, and the actions run end to end", async () => {
  const docId = await start();
  const made = await runCreateShare(member, deps(), { docId, mode: "view", expiresAt: later() });
  if (!made.ok) throw new Error(made.code);
  expect(made.url).toMatch(/^http:\/\/localhost\/m\/[A-Za-z0-9_-]{43}$/);
  expect(await runSetDefaultTtl(member, deps(), { docId, seconds: 86400 })).toEqual({ ok: true });
  // both reach the real room through deps.rooms
  expect(await runSetShareExpiry(member, deps(), { shareId: made.shareId, expiresAt: later() })).toEqual({ ok: true });
  expect(await runRevokeShare(member, deps(), { shareId: made.shareId })).toEqual({ ok: true });
});

test("invalid input is invalid", async () => {
  const docId = await start();
  const invalid = { ok: false, code: "invalid" };
  expect(await runCreateShare(member, deps(), { docId, mode: "admin", expiresAt: later() })).toEqual(invalid);
  expect(await runStartDoc(member, deps(), { inquiryId: "inq_md", localDate: "28/11/2026" })).toEqual(invalid);
});
