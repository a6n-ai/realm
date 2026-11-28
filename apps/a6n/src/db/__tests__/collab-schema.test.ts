import { env } from "cloudflare:test";
import { beforeAll, expect, test } from "vitest";
import { applyMigrations } from "../../../test/migrate";

beforeAll(applyMigrations);

const columns = async (table: string) =>
  (await env.DB.prepare(`select name from pragma_table_info('${table}')`).all<{ name: string }>()).results.map((r) => r.name);

const insertShare = (id: string, mode: string, hash: string) =>
  env.DB.prepare(
    "insert into collab_shares (id, doc_id, token_hash, mode, expires_at, created_at, updated_at) values (?, 'cdc_t', ?, ?, 1, 1, 1)",
  )
    .bind(id, hash, mode)
    .run();

test("collab tables exist after migrations", async () => {
  expect(await columns("collab_docs")).toEqual(expect.arrayContaining(["snapshot", "text", "default_link_ttl_seconds", "owner_ref"]));
  expect(await columns("collab_shares")).toEqual(expect.arrayContaining(["token_hash", "expires_at", "revoked_at", "mode"]));
  await env.DB.prepare(
    "insert into collab_docs (id, organization_id, owner_ref, title, created_at, updated_at) values ('cdc_t', 'org', 'inquiry:x', 'T', 1, 1)",
  ).run();
  await expect(insertShare("csh_a", "admin", "h1")).rejects.toThrow(/CHECK/i);
  await insertShare("csh_b", "edit", "h2");
  await expect(insertShare("csh_c", "view", "h2")).rejects.toThrow(/UNIQUE/i);
});
