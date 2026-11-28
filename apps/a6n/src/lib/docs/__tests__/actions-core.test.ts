import { env } from "cloudflare:test";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { actorOf, freshId, insertUser } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { depsFor } from "../../deps";
import { ME, seed } from "../../meeting-docs/__tests__/seed";
import { runCreateDoc, runCreateDocShare, runDeleteDoc, runSetMember } from "../actions-core";

const deps = () => depsFor(env);
const later = () => Date.now() + 3_600_000;

beforeAll(applyMigrations);
beforeEach(seed);

test("any member can create and share; others are refused; bad input is invalid", async () => {
  const nobody = { ...actorOf(ME, "Sam", "member"), permissions: [] };
  const made = await runCreateDoc(nobody, deps(), {});
  if (!made.ok) throw new Error(made.code);
  const link = await runCreateDocShare(nobody, deps(), { docId: made.id, mode: "view", expiresAt: later() });
  expect(link.ok && link.url).toMatch(/^http:\/\/localhost\/m\/[A-Za-z0-9_-]{43}$/);
  const stranger = actorOf(await insertUser(`s-${freshId()}@x.io`, "owner"), "Bo", "owner");
  expect(await runDeleteDoc(stranger, deps(), { docId: made.id })).toEqual({ ok: false, code: "stale" });
  expect(await runSetMember(nobody, deps(), { docId: made.id, userId: stranger.userId, mode: "admin" })).toEqual({ ok: false, code: "invalid" });
});
