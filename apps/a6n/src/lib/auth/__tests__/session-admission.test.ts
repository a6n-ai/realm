import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { BASE, freshId, freshIp, headersFor, insertUser, json, signIn } from "../../../../test/helpers";
import { createAuth } from "../index";
import { getSession } from "../session";

beforeAll(applyMigrations);

const remove = async (id: string) => {
  await env.DB.batch([
    env.DB.prepare("update users set status = 'removed' where id = ?").bind(id),
    env.DB.prepare("delete from sessions where user_id = ?").bind(id),
    env.DB.prepare("delete from accounts where user_id = ? and provider_id = 'credential'").bind(id),
  ]);
};

describe("session admission", () => {
  test("an active user can sign in and holds a session", async () => {
    const email = `a-${freshId()}@a6n.test`;
    await insertUser(email, "sales");
    const headers = headersFor(await signIn(email));
    expect((await getSession(env, headers))?.email).toBe(email);
  });

  test("a removed user is rejected at sign-in", async () => {
    const email = `r-${freshId()}@a6n.test`;
    await insertUser(email, "sales", "removed");
    const res = await SELF.fetch(`${BASE}/sign-in/email-otp`, {
      method: "POST",
      headers: { ...json, ...freshIp() },
      body: JSON.stringify({ email, otp: "123456" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  test("an existing session is rejected on its next request after removal", async () => {
    const email = `e-${freshId()}@a6n.test`;
    const id = await insertUser(email, "sales");
    const headers = headersFor(await signIn(email));
    expect(await getSession(env, headers)).not.toBeNull();
    await env.DB.prepare("update users set status = 'removed' where id = ?").bind(id).run();
    expect(await getSession(env, headers)).toBeNull();
  });

  test("after removal and re-invite the old password fails", async () => {
    const email = `p-${freshId()}@a6n.test`;
    const id = await insertUser(email, "sales");
    const ctx = await createAuth(env).$context;
    const now = Date.now();
    await env.DB.prepare(
      "insert into accounts (id, user_id, account_id, provider_id, password, created_at, updated_at) values (?, ?, ?, 'credential', ?, ?, ?)",
    )
      .bind(`acc_${freshId()}`, id, id, await ctx.password.hash("old-password-1"), now, now)
      .run();
    const login = () =>
      SELF.fetch(`${BASE}/sign-in/email`, {
        method: "POST",
        headers: { ...json, ...freshIp() },
        body: JSON.stringify({ email, password: "old-password-1" }),
      });
    expect((await login()).status).toBe(200);

    await remove(id);
    await env.DB.prepare("update users set status = 'active', password_set = 0 where id = ?").bind(id).run();
    expect((await login()).status).toBeGreaterThanOrEqual(400);
  });
});
