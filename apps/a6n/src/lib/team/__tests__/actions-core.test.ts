import { actorOf } from "../../../../test/helpers";
import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { depsFor } from "../../deps";
import { MailUnavailableError } from "../../mail/mailer";
import { createMemoryMailer } from "../../mail/memory-mailer";
import { runInvite, runRemove, runResendInvite } from "../actions-core";

const NOW = Date.now();
const admin = actorOf("usr_admin", "Ada", "admin");
const sales = actorOf("usr_sam", "Sam", "sales");
const user = (id: string, role: string) =>
  env.DB.prepare("insert into users (id, name, email, role, status, created_at, updated_at) values (?, ?, ?, ?, 'active', ?, ?)").bind(id, id, `${id}@x.io`, role, NOW, NOW);
const count = async (q: string, ...a: unknown[]) => (await env.DB.prepare(q).bind(...a).first<{ n: number }>())!.n;
const withMailer = (mailer: () => ReturnType<typeof createMemoryMailer>) => ({ ...depsFor(env), mailer });

beforeAll(applyMigrations);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("delete from audit_log"),
    env.DB.prepare("delete from inquiry_activities"),
    env.DB.prepare("delete from inquiries"),
    env.DB.prepare("delete from invites"),
    env.DB.prepare("delete from sessions"),
    env.DB.prepare("delete from accounts"),
    env.DB.prepare("delete from verifications"),
    env.DB.prepare("delete from users"),
    user("usr_admin", "admin"),
    user("usr_sam", "sales"),
  ]);
});

describe("team action cores", () => {
  test("sales is forbidden from invite, resend and remove", async () => {
    const deps = withMailer(() => createMemoryMailer());
    expect(await runInvite(sales, deps, { email: "a@b.io", name: "A" })).toEqual({ ok: false, code: "forbidden" });
    expect(await runResendInvite(sales, deps, { id: "usr_sam" })).toEqual({ ok: false, code: "forbidden" });
    expect(await runRemove(sales, deps, { id: "usr_admin" })).toEqual({ ok: false, code: "forbidden" });
    expect(await count("select count(*) as n from users")).toBe(2);
  });

  test("invalid input is rejected", async () => {
    expect(await runInvite(admin, withMailer(() => createMemoryMailer()), { email: "nope", name: "" })).toEqual({ ok: false, code: "invalid" });
  });

  test("a failed send is ok with sent false and a link", async () => {
    const mailer = createMemoryMailer();
    mailer.failInvites(true);
    const res = await runInvite(admin, withMailer(() => mailer), { email: "new@x.io", name: "New" });
    expect(res).toMatchObject({ ok: true, sent: false });
    if (res.ok) expect(res.inviteLink).toContain("new%40x.io");
  });

  test("an unavailable mailer is mail_unavailable and writes no user", async () => {
    const res = await runInvite(admin, withMailer(() => { throw new MailUnavailableError("down"); }), { email: "new@x.io", name: "New" });
    expect(res).toEqual({ ok: false, code: "mail_unavailable" });
    expect(await count("select count(*) as n from users where email = ?", "new@x.io")).toBe(0);
  });

  test("the invited email is stored lowercase", async () => {
    const res = await runInvite(admin, withMailer(() => createMemoryMailer()), { email: "Mixed@Case.io", name: "Mixed" });
    expect(res).toMatchObject({ ok: true, sent: true });
    expect(await count("select count(*) as n from users where email = ?", "mixed@case.io")).toBe(1);
    expect(await count("select count(*) as n from users where email = ?", "Mixed@Case.io")).toBe(0);
  });

  test("remove maps self, last_admin and already_removed", async () => {
    const deps = withMailer(() => createMemoryMailer());
    expect(await runRemove(admin, deps, { id: "usr_admin" })).toEqual({ ok: false, code: "self" });
    const other = actorOf("usr_sam", "Sam", "admin");
    expect(await runRemove(other, deps, { id: "usr_admin" })).toEqual({ ok: false, code: "last_admin" });
    await env.DB.prepare("update users set status = 'removed' where id = 'usr_sam'").run();
    expect(await runRemove(admin, deps, { id: "usr_sam" })).toEqual({ ok: false, code: "already_removed" });
  });
});
