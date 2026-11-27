import { env } from "cloudflare:test";
import { beforeAll, expect, test } from "vitest";
import { actorOf, ensureTestOrg, TEST_ORG } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { renameOwnOrganization } from "../service";

beforeAll(async () => {
  await applyMigrations();
  await ensureTestOrg();
  await env.DB.prepare("insert or ignore into users (id, name, email, role, status, created_at, updated_at) values ('usr_ro', 'R', 'ro@x.io', 'user', 'active', 1, 1)").run();
});

test("renames only the actor's own organisation, trimmed and bounded", async () => {
  const actor = actorOf("usr_ro", "R", "owner");
  expect(await renameOwnOrganization(getDb(env), "  Acme  ", actor)).toEqual({ ok: true });
  expect((await env.DB.prepare("select name from organizations where id = ?").bind(TEST_ORG).first<{ name: string }>())?.name).toBe("Acme");
  expect(await renameOwnOrganization(getDb(env), " ", actor)).toEqual({ ok: false, code: "invalid" });
  expect(await renameOwnOrganization(getDb(env), "x".repeat(81), actor)).toEqual({ ok: false, code: "invalid" });
});
