import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, test } from "vitest";
import { applyMigrations } from "../../../../test/migrate";
import { freshId, headersFor, insertUser, signIn } from "../../../../test/helpers";
import { getDb } from "../../../db/client";
import { users } from "../../../db/schema";
import { setPasswordCore } from "../set-password";

beforeAll(applyMigrations);

const flag = async (id: string) => (await getDb(env).select({ p: users.passwordSet }).from(users).where(eq(users.id, id)))[0]?.p;
const PW = "Str0ng-Passw0rd-xyz!";

describe("setPasswordCore", () => {
  test("no session -> unauthorized", async () => {
    expect(await setPasswordCore(env, new Headers(), PW)).toEqual({ ok: false, code: "unauthorized" });
  });

  test("sets the password and the flag; a second call is password_exists", async () => {
    const email = `p-${freshId()}@a6n.test`;
    const id = await insertUser(email, "sales");
    const headers = headersFor(await signIn(email));
    expect(await setPasswordCore(env, headers, PW)).toEqual({ ok: true });
    expect(await flag(id)).toBe(true);
    expect(await setPasswordCore(env, headers, PW)).toEqual({ ok: false, code: "password_exists" });
  });

  test("credential exists but flag lost -> heals and returns ok", async () => {
    const email = `p-${freshId()}@a6n.test`;
    const id = await insertUser(email, "sales");
    const headers = headersFor(await signIn(email));
    await setPasswordCore(env, headers, PW);
    await getDb(env).update(users).set({ passwordSet: false }).where(eq(users.id, id));
    expect(await setPasswordCore(env, headers, PW)).toEqual({ ok: true });
    expect(await flag(id)).toBe(true);
  });
});
