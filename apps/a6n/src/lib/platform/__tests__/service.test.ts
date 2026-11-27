import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { getDb } from "../../../db/client";
import { createMemoryMailer } from "../../mail/memory-mailer";
import { createPlatformService } from "../service";

const NOW = Date.now();
const admin = { userId: "usr_sa", name: "Sam Admin" };
const mk = (mailer = createMemoryMailer()) => ({ mailer, svc: createPlatformService(getDb(env), mailer, "http://localhost") });
const all = <T>(q: string, ...a: unknown[]) => env.DB.prepare(q).bind(...a).all<T>().then((r) => r.results);

beforeAll(applyMigrations);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("delete from audit_log"),
    env.DB.prepare("delete from invites"),
    env.DB.prepare("delete from members"),
    env.DB.prepare("delete from organizations"),
    env.DB.prepare("delete from users"),
    env.DB.prepare("insert into users (id, name, email, role, status, created_at, updated_at) values ('usr_sa', 'Sam Admin', 'sa@x.io', 'super_admin', 'active', ?, ?)").bind(NOW, NOW),
  ]);
});

describe("platform organisations", () => {
  test("create makes the organisation and invites its first owner", async () => {
    const { svc, mailer } = mk();
    const r = await svc.createOrganization({ name: "Acme", slug: "acme", ownerEmail: "Boss@Acme.io", ownerName: "Boss" }, admin);
    expect(r).toMatchObject({ ok: true, sent: true });
    const [org] = await all<{ id: string; name: string; slug: string }>("select id, name, slug from organizations");
    expect(org).toMatchObject({ name: "Acme", slug: "acme" });
    expect(await all("select u.email, m.role from members m join users u on u.id = m.user_id where m.organization_id = ?", org!.id)).toEqual([
      { email: "boss@acme.io", role: "owner" },
    ]);
    expect(mailer.sent).toMatchObject([{ kind: "invite", to: "boss@acme.io" }]);
    // The super admin does not become a member: they manage organisations from /admin only.
    expect(await all("select * from members where user_id = 'usr_sa'")).toEqual([]);
  });

  test("slugs are unique and checked", async () => {
    const { svc } = mk();
    await svc.createOrganization({ name: "Acme", slug: "acme", ownerEmail: "a@a.io", ownerName: "A" }, admin);
    expect(await svc.createOrganization({ name: "Acme 2", slug: "acme", ownerEmail: "b@a.io", ownerName: "B" }, admin)).toEqual({ ok: false, code: "slug_taken" });
    expect(await svc.createOrganization({ name: "X", slug: "Not A Slug", ownerEmail: "c@a.io", ownerName: "C" }, admin)).toEqual({ ok: false, code: "invalid" });
    expect(await all("select * from organizations")).toHaveLength(1);
  });

  test("list counts members; rename and add an owner", async () => {
    const { svc } = mk();
    await svc.createOrganization({ name: "Acme", slug: "acme", ownerEmail: "a@a.io", ownerName: "A" }, admin);
    const [org] = await svc.listOrganizations();
    expect(org).toMatchObject({ name: "Acme", slug: "acme", memberCount: 1 });
    expect(await svc.renameOrganization(org!.id, "Acme Inc", admin)).toEqual({ ok: true });
    expect(await svc.addOwner(org!.id, { email: "b@a.io", name: "B" }, admin)).toMatchObject({ ok: true });
    expect((await svc.listOrganizations())[0]).toMatchObject({ name: "Acme Inc", memberCount: 2 });
    expect(await svc.renameOrganization("org_missing", "X", admin)).toEqual({ ok: false, code: "not_found" });
  });

  test("an existing member is promoted to owner instead of invited twice", async () => {
    const { svc } = mk();
    await svc.createOrganization({ name: "Acme", slug: "acme", ownerEmail: "a@a.io", ownerName: "A" }, admin);
    const [org] = await svc.listOrganizations();
    await env.DB.prepare("insert into users (id, name, email, role, status, created_at, updated_at) values ('usr_m', 'M', 'm@a.io', 'user', 'active', ?, ?)").bind(NOW, NOW).run();
    await env.DB.prepare("insert into members (id, organization_id, user_id, role, created_at) values ('mem_m', ?, 'usr_m', 'member', ?)").bind(org!.id, NOW).run();
    expect(await svc.addOwner(org!.id, { email: "m@a.io", name: "M" }, admin)).toEqual({ ok: true, promoted: true });
    expect(await all("select role from members where id = 'mem_m'")).toEqual([{ role: "owner" }]);
  });
});
