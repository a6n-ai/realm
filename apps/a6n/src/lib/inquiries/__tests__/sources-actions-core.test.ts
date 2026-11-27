import { actorOf, memberStmt, orgStmt } from "../../../../test/helpers";
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { depsFor } from "../../deps";
import { runAddSubsource, runCreateSource, runRenameSource, runSetSourceActive } from "../sources-actions-core";

const admin = actorOf("usr_admin", "Ada", "admin");
const sales = actorOf("usr_sam", "Sam", "sales");

beforeAll(applyMigrations);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("delete from audit_log"),
    env.DB.prepare("delete from lead_subsources"),
    env.DB.prepare("delete from lead_sources"),
    env.DB.prepare("delete from users"),
    env.DB.prepare("insert into users (id, name, email, role, status, created_at, updated_at) values ('usr_admin', 'Ada', 'a@x.io', 'admin', 'active', 1, 1)"),
    orgStmt(),
    memberStmt("usr_admin", "admin"),
  ]);
});

describe("source action cores", () => {
  test("sales is forbidden", async () => {
    expect(await runCreateSource(sales, depsFor(env), { key: "web", label: "Web" })).toEqual({ ok: false, code: "forbidden" });
    expect(await runSetSourceActive(sales, depsFor(env), { id: "x", active: false })).toEqual({ ok: false, code: "forbidden" });
  });

  test("create, rename, subsource and deactivate", async () => {
    const made = await runCreateSource(admin, depsFor(env), { key: "web", label: "Web" });
    if (!made.ok || !made.id) throw new Error("setup");
    expect(await runCreateSource(admin, depsFor(env), { key: "web", label: "Again" })).toEqual({ ok: false, code: "invalid" });
    expect(await runRenameSource(admin, depsFor(env), { id: made.id, label: "Website" })).toEqual({ ok: true });
    expect(await runAddSubsource(admin, depsFor(env), { sourceId: made.id, key: "form", label: "Form" })).toMatchObject({ ok: true });
    expect(await runSetSourceActive(admin, depsFor(env), { id: made.id, active: false })).toEqual({ ok: true });
    expect(await runSetSourceActive(admin, depsFor(env), { id: made.id, active: false })).toEqual({ ok: false, code: "stale" });
  });

  test("bad input is invalid", async () => {
    expect(await runCreateSource(admin, depsFor(env), { key: "", label: "x" })).toEqual({ ok: false, code: "invalid" });
  });
});
