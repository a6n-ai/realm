import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { fail } from "../guarded.fns";
import { validate } from "../schemas";
import { setPasswordSchema } from "./schemas";
import { type SetPasswordResult, setPasswordCore } from "./set-password";
import { loadShell, type Shell } from "./shell";

export { safeRedirect } from "./redirect";

// Null means signed out (or removed): the layout turns that into a redirect to /login.
export const getShell = createServerFn({ method: "GET" }).handler(async (): Promise<Shell | null> => {
  try {
    return await loadShell(env, getRequestHeaders());
  } catch (err) {
    return fail(err);
  }
});

export const setPasswordFn = createServerFn({ method: "POST" })
  .validator(validate(setPasswordSchema))
  .handler(async ({ data }): Promise<SetPasswordResult> => {
    try {
      return await setPasswordCore(env, getRequestHeaders(), data.password);
    } catch (err) {
      return fail(err);
    }
  });
