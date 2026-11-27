import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { actorOf, memberStmt, orgStmt, TEST_ORG } from "../../../../test/helpers";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { permissionsFor } from "../../auth/membership";
import { createRolesService } from "../service";

const NOW = Date.now();
const owner = actorOf("usr_o", "Olive", "owner");
const svc = (org = TEST_ORG) => createRolesService(getDb(env), org);

beforeAll(applyMigrations);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("delete from audit_log"),
    env.DB.prepare("delete from organization_roles"),
    env.DB.prepare("delete from users"),
    env.DB.prepare("insert into users (id, name, email, role, status, created_at, updated_at) values ('usr_o', 'Olive', 'o@x.io', 'user', 'active', ?, ?)").bind(NOW, NOW),
    env.DB.prepare("insert into users (id, name, email, role, status, created_at, updated_at) values ('usr_m', 'Max', 'm@x.io', 'user', 'active', ?, ?)").bind(NOW, NOW),
    orgStmt(),
    memberStmt("usr_o", "owner"),
    memberStmt("usr_m"),
  ]);
});

describe("roles", () => {
  test("built-ins are listed first and read-only", async () => {
    const roles = await svc().list();
    expect(roles.slice(0, 3).map((r) => [r.name, r.builtIn])).toEqual([["owner", true], ["admin", true], ["member", true]]);
    expect(roles.find((r) => r.name === "member")?.memberCount).toBe(1);
    expect(await svc().update("owner", ["inquiry:read"], owner)).toEqual({ ok: false, code: "builtin_role" });
    expect(await svc().remove("admin", owner)).toEqual({ ok: false, code: "builtin_role" });
    expect(await svc().create("member", ["inquiry:read"], owner)).toEqual({ ok: false, code: "builtin_role" });
  });

  test("a custom role grants exactly its permissions to its members", async () => {
    expect(await svc().create("sales-lead", ["inquiry:read", "inquiry:assign"], owner)).toEqual({ ok: true });
    await env.DB.prepare("update members set role = 'sales-lead' where user_id = 'usr_m'").run();
    expect(await permissionsFor(getDb(env), TEST_ORG, "sales-lead")).toEqual(["inquiry:assign", "inquiry:read"]);
    expect(await svc().update("sales-lead", ["inquiry:read"], owner)).toEqual({ ok: true });
    expect(await permissionsFor(getDb(env), TEST_ORG, "sales-lead")).toEqual(["inquiry:read"]);
  });

  test("names are checked, unique per organisation, and permissions must be real and held by the creator", async () => {
    expect(await svc().create("Bad Name!", ["inquiry:read"], owner)).toEqual({ ok: false, code: "invalid" });
    expect(await svc().create("ok", ["inquiry:fly" as never], owner)).toEqual({ ok: false, code: "invalid" });
    expect(await svc().create("ok", [], owner)).toEqual({ ok: false, code: "invalid" });
    expect(await svc().create("lead", ["inquiry:read"], owner)).toEqual({ ok: true });
    expect(await svc().create("lead", ["inquiry:read"], owner)).toEqual({ ok: false, code: "name_taken" });
    const member = actorOf("usr_m", "Max", "member");
    expect(await svc().create("boss", ["inquiry:assign"], member)).toEqual({ ok: false, code: "role_not_grantable" });
  });

  test("a role still held by someone cannot be deleted", async () => {
    await svc().create("lead", ["inquiry:read"], owner);
    await env.DB.prepare("update members set role = 'lead' where user_id = 'usr_m'").run();
    expect(await svc().remove("lead", owner)).toEqual({ ok: false, code: "role_in_use" });
    await env.DB.prepare("update members set role = 'member' where user_id = 'usr_m'").run();
    expect(await svc().remove("lead", owner)).toEqual({ ok: true });
    expect(await svc().remove("lead", owner)).toEqual({ ok: false, code: "not_found" });
  });

  test("roles are per organisation", async () => {
    await svc().create("lead", ["inquiry:read"], owner);
    await env.DB.prepare("insert or ignore into organizations (id, name, slug, created_at) values ('org_r2', 'R2', 'r2', ?)").bind(NOW).run();
    expect((await svc("org_r2").list()).map((r) => r.name)).not.toContain("lead");
  });
});
