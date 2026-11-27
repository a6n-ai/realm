import { BaseRepository } from "@foundry/database";
import { env, SELF } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { beforeAll, expect, test } from "vitest";
import { applyMigrations } from "../../../test/migrate";
import { ensureTestOrg, TEST_ORG } from "../../../test/helpers";
import { getDb } from "../client";
import { companies } from "../schema";

beforeAll(applyMigrations);

test("getDb(env) runs select 1 on migrated D1", async () => {
  const rows = await getDb(env).all<{ one: number }>(sql`select 1 as one`);
  expect(rows).toEqual([{ one: 1 }]);
});

test("a repository built on getDb(env) inserts and reads", async () => {
  const repo = new BaseRepository(getDb(env), companies, companies.id, companies.id);
  await ensureTestOrg();
  const created = await repo.create({ organizationId: TEST_ORG, name: "Acme", nameKey: "acme" });
  const found = await repo.findByPublicId(created.id);
  expect(found).toMatchObject({ name: "Acme", nameKey: "acme" });
});

test("createAuth(env) answers through the Worker", async () => {
  const res = await SELF.fetch("http://localhost/api/auth/ok");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
