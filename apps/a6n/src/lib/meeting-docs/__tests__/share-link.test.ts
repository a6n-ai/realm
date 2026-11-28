import { env } from "cloudflare:test";
import { newShareToken } from "@foundry/collab/token";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { TEST_ORG } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { createMeetingDocsService } from "../service";
import { resolveShare } from "../share-link";
import { ME, seed } from "./seed";

const actor = { userId: ME, name: "me@x.io" };
const svc = () => createMeetingDocsService(getDb(env), TEST_ORG, { revoke: async () => {} });
const expiresAt = Date.now() + 3_600_000;

async function live() {
  const doc = await svc().start("inq_md", "2026-11-28", actor);
  if (!doc.ok) throw new Error(doc.code);
  const share = await svc().createShare(doc.id, { mode: "edit", expiresAt }, actor);
  if (!share.ok) throw new Error(share.code);
  return { docId: doc.id, ...share };
}

beforeAll(applyMigrations);
beforeEach(seed);

test("resolves a live share without CRM data", async () => {
  const { docId, shareId, token } = await live();
  expect(await resolveShare(getDb(env), token)).toStrictEqual({
    status: "ok",
    shareId,
    docId,
    mode: "edit",
    expiresAt,
    title: "Meeting with Ana - 2026-11-28",
    orgName: "Test org",
    sharedBy: "me@x.io",
  });
});

test("expired link", async () => {
  const { token } = await live();
  expect(await resolveShare(getDb(env), token, expiresAt)).toEqual({ status: "expired" });
});

test("revoked link", async () => {
  const { token, shareId } = await live();
  await svc().revokeShare(shareId, actor);
  expect(await resolveShare(getDb(env), token)).toEqual({ status: "unavailable" });
});

test("malformed and unknown tokens are unavailable", async () => {
  expect(await resolveShare(getDb(env), "nope")).toEqual({ status: "unavailable" });
  expect(await resolveShare(getDb(env), newShareToken())).toEqual({ status: "unavailable" });
});
