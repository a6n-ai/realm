import { env } from "cloudflare:test";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { TEST_ORG } from "../../../test/helpers";
import { applyMigrations } from "../../../test/migrate";
import { ME, rows, seed } from "../../lib/meeting-docs/__tests__/seed";

beforeAll(applyMigrations);
beforeEach(seed);

test("one grant per person per doc, a known mode only, removed with the doc", async () => {
  await env.DB.prepare("insert into collab_docs (id, created_at, updated_at, organization_id, owner_ref, title) values ('cdc_m', 1, 1, ?, ?, 't')")
    .bind(TEST_ORG, `user:${ME}`)
    .run();
  const add = (id: string, mode: string) =>
    env.DB.prepare("insert into doc_members (id, created_at, updated_at, doc_id, user_id, mode) values (?, 1, 1, 'cdc_m', ?, ?)").bind(id, ME, mode).run();
  await add("dmb_1", "view");
  await expect(add("dmb_2", "edit")).rejects.toThrow(/UNIQUE/);
  await env.DB.prepare("delete from doc_members").run();
  await expect(add("dmb_3", "admin")).rejects.toThrow(/CHECK/);
  await add("dmb_4", "edit");
  await env.DB.prepare("delete from collab_docs where id = 'cdc_m'").run();
  expect(await rows("select id from doc_members")).toEqual([]);
});
