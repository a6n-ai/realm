import { env } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../test/migrate";

const TABLES = [
  "users", "sessions", "accounts", "verifications", "rate_limits", "invites", "companies",
  "lead_sources", "lead_subsources", "inquiries", "inquiry_activities", "audit_log",
];
const INDEXES = [
  "users_email_uq", "sessions_token_uq", "session_user_id_idx", "account_user_id_idx",
  "verification_identifier_idx", "rate_limits_key_uq", "invites_idempotency_key_uq", "invites_user_n_uq",
  "companies_name_key_uq", "lead_sources_key_uq", "lead_subsources_source_key_uq",
  "inquiries_owner_follow_up_idx", "inquiries_stage_created_idx", "inquiries_source_external_uq",
  "inquiry_activities_inquiry_created_idx",
];

const rows = async <T>(query: string) => (await env.DB.prepare(query).all<T>()).results;

beforeAll(async () => {
  await applyMigrations();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("insert into lead_sources (id, created_at, key, label) values ('lsr_a', ?, 'cold', 'Cold')").bind(now),
  ]);
});

const insert = (id: string, cols: Record<string, unknown>) => {
  const all = { id, created_at: Date.now(), source_id: "lsr_a", ...cols };
  const keys = Object.keys(all);
  return env.DB.prepare(`insert into inquiries (${keys.join(",")}) values (${keys.map(() => "?").join(",")})`)
    .bind(...Object.values(all))
    .run();
};

describe("schema", () => {
  test("expected tables and indexes exist", async () => {
    const names = (await rows<{ name: string }>("select name from sqlite_master where type = 'table'")).map((r) => r.name);
    for (const t of TABLES) expect(names).toContain(t);
    const idx = (await rows<{ name: string }>("select name from sqlite_master where type = 'index'")).map((r) => r.name);
    for (const i of INDEXES) expect(idx).toContain(i);
  });

  test("no unique index on inquiries phone or email", async () => {
    const list = await rows<{ name: string; unique: number }>("select name, \"unique\" from pragma_index_list('inquiries')");
    for (const i of list.filter((x) => x.unique === 1)) {
      const cols = (await rows<{ name: string }>(`select name from pragma_index_info('${i.name}')`)).map((c) => c.name);
      expect(cols).not.toContain("phone");
      expect(cols).not.toContain("email");
    }
  });

  test("an open inquiry without next_follow_up_at is rejected", async () => {
    await expect(insert("inq_open", { contact_name: "A" })).rejects.toThrow(/CHECK constraint failed/);
    await insert("inq_ok", { contact_name: "A", next_follow_up_at: Date.now() });
    await insert("inq_closed", { contact_name: "A", closed_at: Date.now() });
  });

  test("an inquiry with neither name nor phone is rejected", async () => {
    await expect(insert("inq_anon", { email: "a@b.c", next_follow_up_at: Date.now() })).rejects.toThrow(
      /CHECK constraint failed/,
    );
    await insert("inq_phone", { phone: "1", next_follow_up_at: Date.now() });
  });
});
