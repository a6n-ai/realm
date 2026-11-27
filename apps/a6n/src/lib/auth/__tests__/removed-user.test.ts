import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { BASE, freshId, freshIp, headersFor, insertUser, json, signIn } from "../../../../test/helpers";
import { memoryMailer } from "../../mail/memory-mailer";

beforeAll(applyMigrations);

const post = (path: string, body: unknown, extra: Record<string, string> = {}) =>
  SELF.fetch(`${BASE}${path}`, { method: "POST", headers: { ...json, ...freshIp(), ...extra }, body: JSON.stringify(body) });

describe("removed users", () => {
  test("requesting a sign-in code sends no mail", async () => {
    const email = `rm-${freshId()}@a6n.test`;
    await insertUser(email, "sales", "removed");
    const res = await post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(memoryMailer.sent.filter((m) => m.to === email)).toEqual([]);
  });

  test("reset-password is refused and writes no credential; re-invite leaves passwordSet false", async () => {
    const email = `rp-${freshId()}@a6n.test`;
    const id = await insertUser(email, "sales", "removed");
    const res = await post("/email-otp/reset-password", { email, otp: "123456", password: "chosen-password-1" });
    expect(res.status).toBe(403);
    for (const path of ["/email-otp/request-password-reset", "/forget-password/email-otp"]) {
      expect((await post(path, { email })).status).toBe(403);
    }
    const accounts = await env.DB.prepare("select * from accounts where user_id = ?").bind(id).all();
    expect(accounts.results).toHaveLength(0);
    await env.DB.prepare("update users set status = 'active', password_set = 0 where id = ?").bind(id).run();
    const row = await env.DB.prepare("select password_set from users where id = ?").bind(id).first<{ password_set: number }>();
    expect(row?.password_set).toBe(0);
    expect((await post("/sign-in/email", { email, password: "chosen-password-1" })).status).toBeGreaterThanOrEqual(400);
  });
});

describe("admin plugin routes", () => {
  test("an admin cannot reach /admin/set-role", async () => {
    const email = `ad-${freshId()}@a6n.test`;
    await insertUser(email, "admin");
    const cookie = await signIn(email);
    const res = await SELF.fetch(`${BASE}/admin/set-role`, {
      method: "POST",
      headers: { ...json, ...freshIp(), ...Object.fromEntries(headersFor(cookie)) },
      body: JSON.stringify({ userId: "usr_x", role: "admin" }),
    });
    expect(res.status).toBe(404);
  });
});
