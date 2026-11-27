import { APIError } from "better-auth/api";
import { and, eq, isNotNull } from "drizzle-orm";
import type { Env } from "../../env";
import { getDb } from "../../db/client";
import { accounts, users } from "../../db/schema";
import { ConsoleError, requireActor } from "./actor";
import { createAuth } from "./index";

export type SetPasswordResult = { ok: true } | { ok: false; code: string };

export async function setPasswordCore(env: Env, headers: Headers, password: string): Promise<SetPasswordResult> {
  let actor;
  try {
    actor = await requireActor(env, headers, { write: true });
  } catch (err) {
    if (err instanceof ConsoleError && err.status === 401) return { ok: false, code: "unauthorized" };
    throw err;
  }
  const db = getDb(env);
  try {
    await (await createAuth(env)).api.setPassword({ body: { newPassword: password }, headers });
  } catch (err) {
    if (!(err instanceof APIError)) throw err;
    const [user] = await db.select({ passwordSet: users.passwordSet }).from(users).where(eq(users.id, actor.userId));
    const [cred] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, actor.userId), eq(accounts.providerId, "credential"), isNotNull(accounts.password)));
    // A credential without the flag means an earlier call set the password but its flag update failed: heal it.
    if (!cred || user?.passwordSet) {
      const code = (err.body as { code?: string } | undefined)?.code;
      return { ok: false, code: cred ? "password_exists" : (code ?? "set_password_failed").toLowerCase() };
    }
  }
  await db.update(users).set({ passwordSet: true }).where(eq(users.id, actor.userId));
  return { ok: true };
}
