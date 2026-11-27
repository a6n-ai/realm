import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { BASE, freshId, freshIp, headersFor, insertUser, json, signIn } from "../../../../test/helpers";
import { memoryMailer } from "../../mail/memory-mailer";
import { getSession } from "../session";

beforeAll(applyMigrations);

const post = (path: string, body: unknown, extra: Record<string, string> = {}) =>
  SELF.fetch(`${BASE}${path}`, { method: "POST", headers: { ...json, ...freshIp(), ...extra }, body: JSON.stringify(body) });

async function resetCode(email: string): Promise<string> {
  const before = memoryMailer.lastCode(email);
  expect((await post("/email-otp/request-password-reset", { email })).status).toBe(200);
  await expect.poll(() => memoryMailer.lastCode(email)).not.toBe(before);
  return memoryMailer.lastCode(email) as string;
}

describe("password reset by email code", () => {
  test("signs out every existing session and flips passwordSet", async () => {
    const email = `reset-${freshId()}@a6n.test`;
    const id = await insertUser(email, "sales");
    const headers = headersFor(await signIn(email));
    expect(await getSession(env, headers)).not.toBeNull();

    const otp = await resetCode(email);
    expect((await post("/email-otp/reset-password", { email, otp, password: "a-new-password-12" })).status).toBe(200);

    expect(await getSession(env, headers)).toBeNull();
    const row = await env.DB.prepare("select password_set from users where id = ?").bind(id).first<{ password_set: number }>();
    expect(row?.password_set).toBe(1);
    expect((await post("/sign-in/email", { email, password: "a-new-password-12" })).status).toBe(200);
  });

  test("rejects a password shorter than 12 characters", async () => {
    const email = `short-${freshId()}@a6n.test`;
    const id = await insertUser(email, "sales");
    const otp = await resetCode(email);
    const res = await post("/email-otp/reset-password", { email, otp, password: "elevenchars" });
    expect(res.status).toBe(400);
    expect((await env.DB.prepare("select 1 from accounts where user_id = ?").bind(id).all()).results).toHaveLength(0);
  });
});

describe("last sign-in", () => {
  test("a sign-in sets users.last_sign_in_at and sign-out keeps it", async () => {
    const email = `last-${freshId()}@a6n.test`;
    const id = await insertUser(email, "sales");
    const at = async () =>
      (await env.DB.prepare("select last_sign_in_at as t from users where id = ?").bind(id).first<{ t: number | null }>())?.t;
    expect(await at()).toBeNull();
    const t0 = Date.now();
    const cookie = await signIn(email);
    const stamped = await at();
    expect(stamped).toBeGreaterThanOrEqual(t0);
    expect((await post("/sign-out", {}, { cookie, origin: "http://localhost" })).status).toBe(200);
    expect((await env.DB.prepare("select count(*) as n from sessions where user_id = ?").bind(id).first<{ n: number }>())?.n).toBe(0);
    expect(await at()).toBe(stamped);
  });
});
