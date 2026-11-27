import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { APIError } from "better-auth/api";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { users } from "../../db/schema";
import { validate } from "../schemas";
import { ConsoleError, requireActor, toResponseError } from "./actor";
import { createAuth } from "./index";
import { setPasswordSchema } from "./schemas";
import { loadShell, type Shell } from "./shell";

export { safeRedirect } from "./redirect";

// Null means signed out (or removed): the layout turns that into a redirect to /login.
export const getShell = createServerFn({ method: "GET" }).handler(async (): Promise<Shell | null> => {
  try {
    return await loadShell(env, getRequestHeaders());
  } catch (err) {
    toResponseError(err);
  }
});

export const setPasswordFn = createServerFn({ method: "POST" })
  .validator(validate(setPasswordSchema))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; code: string }> => {
    try {
      const headers = getRequestHeaders();
      const actor = await requireActor(env, headers, { write: true });
      try {
        await createAuth(env).api.setPassword({ body: { newPassword: data.password }, headers });
      } catch (err) {
        if (err instanceof APIError) return { ok: false, code: "password_exists" };
        throw err;
      }
      await getDb(env).update(users).set({ passwordSet: true }).where(eq(users.id, actor.userId));
      return { ok: true };
    } catch (err) {
      if (err instanceof ConsoleError && err.status === 401) return { ok: false, code: "unauthorized" };
      toResponseError(err);
    }
  });
