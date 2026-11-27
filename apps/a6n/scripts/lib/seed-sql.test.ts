import { env } from "cloudflare:test";
import { hashPassword } from "better-auth/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../test/migrate";
import { promoteSql, seedSql } from "./seed-sql";

const run = (sql: string[]) => env.DB.batch(sql.map((s) => env.DB.prepare(s)));
const count = async (table: string) =>
  (await env.DB.prepare(`select count(*) as n from ${table}`).first<{ n: number }>())!.n;

describe("seedSql", () => {
  let sql: string[];
  beforeAll(async () => {
    await applyMigrations();
    const passwordHash = await hashPassword("x");
    sql = seedSql([
      { email: "a@x.com", name: "A", passwordHash },
      { email: "b@x.com", name: "B", passwordHash },
    ]);
    await run(sql);
  });

  it("creates admins with credential accounts and a credential-less system actor", async () => {
    const admins = await env.DB.prepare(
      "select u.email, a.provider_id from users u join accounts a on a.user_id = u.id where u.role = 'admin' order by u.email",
    ).all<{ email: string; provider_id: string }>();
    expect(admins.results).toEqual([
      { email: "a@x.com", provider_id: "credential" },
      { email: "b@x.com", provider_id: "credential" },
    ]);
    const sys = await env.DB.prepare("select email, status from users where id = 'usr_system'").first();
    expect(sys).toEqual({ email: "system@crm.a6n.ai", status: "removed" });
    expect(await env.DB.prepare("select 1 from accounts where user_id = 'usr_system'").first()).toBeNull();
  });

  it("seeds sources and sub-sources", async () => {
    const rows = await env.DB.prepare(
      "select s.key as s, group_concat(ss.key) as subs from lead_sources s join lead_subsources ss on ss.source_id = s.id group by s.key order by s.key",
    ).all<{ s: string; subs: string }>();
    expect(rows.results.map((r) => [r.s, r.subs.split(",").sort()])).toEqual([
      ["cold", ["call", "email", "linkedin"]],
      ["referral", ["client", "partner"]],
      ["website", ["contact-form"]],
    ]);
  });

  it("is a no-op when re-applied", async () => {
    const before = [await count("users"), await count("accounts"), await count("lead_sources"), await count("lead_subsources")];
    await run(sql);
    expect([await count("users"), await count("accounts"), await count("lead_sources"), await count("lead_subsources")]).toEqual(before);
  });
});

describe("promoteSql", () => {
  beforeAll(applyMigrations);

  it("promotes an active user and writes one audit row", async () => {
    await run(seedSql([]));
    const now = Date.now();
    await env.DB.prepare(
      "insert into users (id, name, email, role, status, created_at, updated_at) values ('usr_p1', 'P', 'p@x.com', 'sales', 'active', ?, ?)",
    ).bind(now, now).run();
    const before = await count("audit_log");
    await run(promoteSql("p@x.com", "owner@x.com"));
    expect((await env.DB.prepare("select role from users where id = 'usr_p1'").first<{ role: string }>())!.role).toBe("admin");
    expect(await count("audit_log")).toBe(before + 1);
    const row = await env.DB.prepare("select action, actor_id, target, data from audit_log order by created_at desc limit 1").first();
    expect(row).toEqual({ action: "role.promote", actor_id: "usr_system", target: "usr_p1", data: '{"by":"owner@x.com"}' });
  });

  it("writes no audit row for an unknown email", async () => {
    const before = await count("audit_log");
    await run(promoteSql("nobody@x.com", "owner@x.com"));
    expect(await count("audit_log")).toBe(before);
  });
});
