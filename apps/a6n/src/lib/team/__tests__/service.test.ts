import { env, SELF } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { BASE, freshIp, json } from "../../../../test/helpers";
import { getDb } from "../../../db/client";
import { createAuth } from "../../auth";
import { createInquiriesService } from "../../inquiries/service";
import { createMemoryMailer } from "../../mail/memory-mailer";
import { MailUnavailableError } from "../../mail/mailer";
import { createTeamService } from "../service";

const NOW = Date.now();
const admin = { userId: "usr_admin", name: "Ada", role: "admin" as const };
const admin2 = { userId: "usr_admin2", name: "Bo", role: "admin" as const };
const AUTH_URL = "http://localhost";
const all = <T>(q: string, ...args: unknown[]) => env.DB.prepare(q).bind(...args).all<T>().then((r) => r.results);
const mk = (mailer = createMemoryMailer()) => ({ mailer, svc: createTeamService(getDb(env), mailer, AUTH_URL) });

const user = (id: string, role: string, status = "active") =>
  env.DB.prepare(
    "insert into users (id, name, email, role, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, id, `${id}@x.io`, role, status, NOW, NOW);

const inquiry = (id: string, owner: string | null, closed: boolean) =>
  env.DB.prepare(
    `insert into inquiries (id, created_at, contact_name, source_id, stage, owner_id, next_follow_up_at, closed_at)
     values (?, ?, 'c', 'lsr_cold', ?, ?, ?, ?)`,
  ).bind(id, NOW, closed ? "won" : "new", owner, closed ? null : NOW + 1000, closed ? NOW : null);

beforeAll(applyMigrations);

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("delete from inquiry_activities"),
    env.DB.prepare("delete from inquiries"),
    env.DB.prepare("delete from lead_sources"),
    env.DB.prepare("delete from audit_log"),
    env.DB.prepare("delete from invites"),
    env.DB.prepare("delete from sessions"),
    env.DB.prepare("delete from accounts"),
    env.DB.prepare("delete from verifications"),
    env.DB.prepare("delete from users"),
    user("usr_admin", "admin"),
    user("usr_admin2", "admin"),
    user("usr_sam", "sales"),
    env.DB.prepare("insert into lead_sources (id, created_at, key, label, active) values ('lsr_cold', ?, 'cold', 'Cold', 1)").bind(NOW),
  ]);
});

describe("remove", () => {
  test("unassigns only open inquiries and keeps closed ones and authored activities", async () => {
    await env.DB.batch([
      inquiry("inq_open", "usr_sam", false),
      inquiry("inq_closed", "usr_sam", true),
      env.DB.prepare(
        "insert into inquiry_activities (id, created_at, inquiry_id, type, actor_id) values ('iac_own', ?, 'inq_closed', 'note', 'usr_sam')",
      ).bind(NOW),
    ]);
    expect(await mk().svc.remove("usr_sam", admin)).toEqual({ removed: true });
    const rows = await all<{ id: string; owner_id: string | null }>("select id, owner_id from inquiries order by id");
    expect(rows).toEqual([{ id: "inq_closed", owner_id: "usr_sam" }, { id: "inq_open", owner_id: null }]);
    const acts = await all<{ type: string; from_owner_id: string | null }>("select * from inquiry_activities where inquiry_id = 'inq_open'");
    expect(acts).toMatchObject([{ type: "reassigned", from_owner_id: "usr_sam" }]);
    expect(await all("select * from inquiry_activities where id = 'iac_own'")).toHaveLength(1);
    expect(await all("select * from audit_log where action = 'team.remove' and target = 'usr_sam'")).toHaveLength(1);
    expect(await all("select status from users where id = 'usr_sam'")).toEqual([{ status: "removed" }]);
  });

  test("removes a user with 150 open inquiries", async () => {
    await env.DB.batch(Array.from({ length: 150 }, (_, i) => inquiry(`inq_${i}`, "usr_sam", false)));
    expect(await mk().svc.remove("usr_sam", admin)).toEqual({ removed: true });
    expect(await all("select * from inquiries where owner_id is not null")).toHaveLength(0);
    expect(await all("select * from inquiry_activities where type = 'reassigned'")).toHaveLength(150);
  });

  test("a claim by the removed user in parallel still ends unassigned", async () => {
    await env.DB.batch([inquiry("inq_a", null, false), inquiry("inq_b", "usr_sam", false)]);
    const inq = createInquiriesService(getDb(env));
    await Promise.all([inq.claim("inq_a", { userId: "usr_sam" }), mk().svc.remove("usr_sam", admin)]);
    expect(await all("select * from inquiries where owner_id is not null")).toHaveLength(0);
  });

  test("refuses self and the last admin with the right reasons", async () => {
    const { svc } = mk();
    expect(await svc.remove("usr_admin", admin)).toEqual({ removed: false, reason: "self" });
    await env.DB.prepare("update users set status = 'removed' where id = 'usr_admin2'").run();
    expect(await svc.remove("usr_admin", admin2)).toEqual({ removed: false, reason: "last_admin" });
    expect(await svc.remove("usr_admin2", admin)).toEqual({ removed: false, reason: "already_removed" });
    expect(await all("select * from audit_log")).toHaveLength(0);
  });

  test("two admins removing each other at once leave one active admin", async () => {
    const { svc } = mk();
    const r = await Promise.all([svc.remove("usr_admin2", admin), svc.remove("usr_admin", admin2)]);
    expect(r.filter((x) => x.removed)).toHaveLength(1);
    expect(r.find((x) => !x.removed)).toMatchObject({ reason: "last_admin" });
    expect(await all("select * from users where role = 'admin' and status = 'active'")).toHaveLength(1);
  });

  test("a repeat removal writes no second audit row", async () => {
    const { svc } = mk();
    await svc.remove("usr_sam", admin);
    expect(await svc.remove("usr_sam", admin)).toEqual({ removed: false, reason: "already_removed" });
    expect(await all("select * from audit_log")).toHaveLength(1);
  });

  test("deletes sessions, credential accounts and verifications keyed by the email", async () => {
    await env.DB.batch([
      env.DB.prepare("insert into sessions (id, user_id, token, expires_at, created_at, updated_at) values ('ses_1', 'usr_sam', 't', ?, ?, ?)").bind(NOW + 1e6, NOW, NOW),
      env.DB.prepare("insert into accounts (id, user_id, account_id, provider_id, password, created_at, updated_at) values ('acc_1', 'usr_sam', 'usr_sam', 'credential', 'h', ?, ?)").bind(NOW, NOW),
      env.DB.prepare("insert into accounts (id, user_id, account_id, provider_id, created_at, updated_at) values ('acc_2', 'usr_sam', 'g', 'google', ?, ?)").bind(NOW, NOW),
      env.DB.prepare("insert into verifications (id, identifier, value, expires_at, created_at, updated_at) values ('ver_1', 'sign-in-otp-usr_sam@x.io', 'v', ?, ?, ?)").bind(NOW + 1e6, NOW, NOW),
      env.DB.prepare("insert into verifications (id, identifier, value, expires_at, created_at, updated_at) values ('ver_2', 'sign-in-otp-other@x.io', 'v', ?, ?, ?)").bind(NOW + 1e6, NOW, NOW),
    ]);
    await mk().svc.remove("usr_sam", admin);
    expect(await all("select * from sessions")).toHaveLength(0);
    expect(await all("select id from accounts")).toEqual([{ id: "acc_2" }]);
    expect(await all("select id from verifications")).toEqual([{ id: "ver_2" }]);
  });
});

describe("remove isolation and claim", () => {
  test("deletes only the removed user's codes, not a longer email's", async () => {
    const ver = (id: string, ident: string) =>
      env.DB.prepare("insert into verifications (id, identifier, value, expires_at, created_at, updated_at) values (?, ?, 'v', ?, ?, ?)").bind(id, ident, NOW + 1e6, NOW, NOW);
    await env.DB.batch([
      user("usr_b", "sales").bind("usr_b", "usr_b", "b@x.com", "sales", "active", NOW, NOW),
      ver("v1", "sign-in-otp-b@x.com"),
      ver("v2", "forget-password-otp-b@x.com"),
      ver("v3", "sign-in-otp-a.b@x.com"),
      ver("v4", "email-verification-otp-a.b@x.com"),
    ]);
    expect(await mk().svc.remove("usr_b", admin)).toEqual({ removed: true });
    expect((await all<{ id: string }>("select id from verifications order by id")).map((r) => r.id)).toEqual(["v3", "v4"]);
  });

  test("a claim after removal is refused and owner stays null", async () => {
    await inquiry("inq_a", null, false).run();
    await mk().svc.remove("usr_sam", admin);
    expect(await createInquiriesService(getDb(env)).claim("inq_a", { userId: "usr_sam" })).toMatchObject({ ok: false });
    expect(await all("select owner_id from inquiries where id = 'inq_a'")).toEqual([{ owner_id: null }]);
  });
});

describe("invite", () => {
  test("two concurrent invites of one new email: one ok, one already_active, one row, one mail", async () => {
    const mailer = createMemoryMailer();
    const a = createTeamService(getDb(env), mailer, AUTH_URL);
    const b = createTeamService(getDb(env), mailer, AUTH_URL);
    const r = await Promise.all([a.invite({ email: "race@x.io", name: "R" }, admin), b.invite({ email: "race@x.io", name: "R" }, admin)]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.filter((x) => !x.ok)).toEqual([{ ok: false, code: "already_active" }]);
    expect(await all("select * from invites")).toHaveLength(1);
    expect(mailer.sent).toHaveLength(1);
  });

  test("a trailing slash on authUrl does not double up in the link", async () => {
    const svc = createTeamService(getDb(env), createMemoryMailer(), "http://localhost/");
    expect(await svc.invite({ email: "s@x.io", name: "S" }, admin)).toMatchObject({ inviteLink: "http://localhost/login?email=s%40x.io&invited=1" });
  });

  test("creates the user and an invites row, sends the link and records the message id", async () => {
    const { svc, mailer } = mk();
    const r = await svc.invite({ email: "New@X.io", name: "New" }, admin);
    expect(r).toEqual({ ok: true, sent: true, inviteLink: "http://localhost/login?email=new%40x.io&invited=1" });
    const [u] = await all<{ id: string; role: string; password_set: number }>("select * from users where email = 'new@x.io'");
    expect(u).toMatchObject({ role: "sales", password_set: 0 });
    const [inv] = await all<{ n: number; idempotency_key: string; relay_message_id: string | null; sent_at: number | null }>("select * from invites");
    expect(inv).toMatchObject({ n: 1, idempotency_key: `invite:${u!.id}:1` });
    expect(inv!.relay_message_id).toMatch(/^mem_/);
    expect(inv!.sent_at).not.toBeNull();
    expect(mailer.sent).toMatchObject([{ kind: "invite", to: "new@x.io", inviterName: "Ada" }]);
    expect(await all("select * from audit_log")).toHaveLength(0);
  });

  test("a Relay failure still creates the user, keeps a null message id and returns the link", async () => {
    const { svc, mailer } = mk();
    mailer.failInvites(true);
    const r = await svc.invite({ email: "f@x.io", name: "F" }, admin);
    expect(r).toMatchObject({ ok: true, sent: false, inviteLink: expect.stringContaining("/login?email=f%40x.io") });
    expect(await all("select * from users where email = 'f@x.io'")).toHaveLength(1);
    expect(await all("select relay_message_id from invites")).toEqual([{ relay_message_id: null }]);
  });

  test("a missing mail binding returns mail_unavailable and creates no user", async () => {
    const svc = createTeamService(getDb(env), () => { throw new MailUnavailableError("RELAY binding missing"); }, AUTH_URL);
    expect(await svc.invite({ email: "m@x.io", name: "M" }, admin)).toEqual({ ok: false, code: "mail_unavailable" });
    expect(await all("select * from users where email = 'm@x.io'")).toHaveLength(0);
    expect(await all("select * from invites")).toHaveLength(0);
  });

  test("an active email returns already_active and writes no row", async () => {
    const r = await mk().svc.invite({ email: "usr_sam@x.io", name: "Sam" }, admin);
    expect(r).toEqual({ ok: false, code: "already_active" });
    expect(await all("select * from invites")).toHaveLength(0);
  });

  test("two concurrent resends get distinct n values", async () => {
    const { svc } = mk();
    await svc.invite({ email: "c@x.io", name: "C" }, admin);
    const [{ id }] = await all<{ id: string }>("select id from users where email = 'c@x.io'") as [{ id: string }];
    await Promise.all([svc.resendInvite(id, admin), svc.resendInvite(id, admin)]);
    expect((await all<{ n: number }>("select n from invites order by n")).map((r) => r.n)).toEqual([1, 2, 3]);
  });

  test("inviteStatuses reads the latest row per user, failed when no message id", async () => {
    const { svc, mailer } = mk();
    await svc.invite({ email: "s@x.io", name: "S" }, admin);
    mailer.failInvites(true);
    await svc.invite({ email: "t@x.io", name: "T" }, admin);
    const ids = (await all<{ id: string; email: string }>("select id, email from users where email in ('s@x.io','t@x.io') order by email")).map((r) => r.id);
    expect(await svc.inviteStatuses(ids)).toEqual({ [ids[0]!]: "sent", [ids[1]!]: "failed" });
  });

  test("a Relay status failure maps every looked-up member to unknown instead of throwing", async () => {
    const { svc, mailer } = mk();
    await svc.invite({ email: "s@x.io", name: "S" }, admin);
    mailer.failInvites(true);
    await svc.invite({ email: "t@x.io", name: "T" }, admin);
    const ids = (await all<{ id: string }>("select id from users where email in ('s@x.io','t@x.io') order by email")).map((r) => r.id);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const down = createTeamService(getDb(env), { ...mailer, statusByKeys: async () => { throw new Error("relay down"); } }, AUTH_URL);
    expect(await down.inviteStatuses(ids)).toEqual({ [ids[0]!]: "unknown", [ids[1]!]: "failed" });
    log.mockRestore();
  });

  test("inviting the system actor's email is refused as invalid and does not reactivate it", async () => {
    await env.DB.prepare(
      "insert into users (id, name, email, role, status, created_at, updated_at) values ('usr_system', 'System', 'system@app.a6n.ai', 'sales', 'removed', ?, ?)",
    ).bind(NOW, NOW).run();
    const { svc, mailer } = mk();
    expect(await svc.invite({ email: "system@app.a6n.ai", name: "Sys" }, admin)).toEqual({ ok: false, code: "invalid" });
    expect(await all("select status from users where id = 'usr_system'")).toEqual([{ status: "removed" }]);
    expect(await all("select * from invites")).toHaveLength(0);
    expect(mailer.sent).toHaveLength(0);
  });

  test("list returns open inquiry counts and the latest invite", async () => {
    await env.DB.batch([inquiry("inq_1", "usr_sam", false), inquiry("inq_2", "usr_sam", true)]);
    const { svc } = mk();
    await svc.invite({ email: "l@x.io", name: "L" }, admin);
    const rows = await svc.list();
    expect(rows.find((r) => r.id === "usr_sam")).toMatchObject({ openInquiries: 1, latestInvite: null });
    expect(rows.find((r) => r.email === "l@x.io")).toMatchObject({ latestInvite: { n: 1 }, passwordSet: false });
  });

  test("list reads users.last_sign_in_at, which outlives sessions; pendingLink only for pending members", async () => {
    await env.DB.prepare("update users set last_sign_in_at = ? where id = 'usr_sam'").bind(NOW - 1000).run();
    const { svc } = mk();
    const rows = await svc.list();
    expect(rows.find((r) => r.id === "usr_sam")!.lastSignIn).toBe(NOW - 1000);
    expect(rows.find((r) => r.id === "usr_admin")!.lastSignIn).toBeNull();
    const m = { email: "a@x.io", status: "active", passwordSet: false };
    expect(svc.pendingLink(m)).toContain("invited=1");
    expect(svc.pendingLink({ ...m, passwordSet: true })).toBeNull();
    expect(svc.pendingLink({ ...m, status: "removed" })).toBeNull();
  });

  test("after removal and re-invite the same row is reactivated and the old password fails", async () => {
    const { svc } = mk();
    const ctx = await (await createAuth(env)).$context;
    await env.DB.prepare(
      "insert into accounts (id, user_id, account_id, provider_id, password, created_at, updated_at) values ('acc_pw', 'usr_sam', 'usr_sam', 'credential', ?, ?, ?)",
    ).bind(await ctx.password.hash("old-password-1"), NOW, NOW).run();
    const login = () =>
      SELF.fetch(`${BASE}/sign-in/email`, {
        method: "POST",
        headers: { ...json, ...freshIp() },
        body: JSON.stringify({ email: "usr_sam@x.io", password: "old-password-1" }),
      });
    expect((await login()).status).toBe(200);

    expect(await svc.remove("usr_sam", admin)).toEqual({ removed: true });
    expect(await svc.invite({ email: "usr_sam@x.io", name: "Sam" }, admin)).toMatchObject({ ok: true, sent: true });
    expect(await all("select id, status, password_set from users where email = 'usr_sam@x.io'")).toEqual([
      { id: "usr_sam", status: "active", password_set: 0 },
    ]);
    expect((await login()).status).toBeGreaterThanOrEqual(400);
  });
});
