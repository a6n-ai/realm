import { setResponseStatus } from "@tanstack/react-start/server";
import type { Env } from "../../env";
import { allows, type Permission, type Role } from "./permissions";
import { getSession } from "./session";

export type Actor = { userId: string; name: string; role: Role };

export class ConsoleError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429,
    message: string,
  ) {
    super(message);
  }
}

export async function requireActor(
  env: Env,
  headers: Headers,
  opts: { permission?: Permission; write?: boolean } = {},
): Promise<Actor> {
  const user = await getSession(env, headers);
  if (!user) throw new ConsoleError(401, "unauthorized");
  if (opts.permission && !allows(user.role, opts.permission)) throw new ConsoleError(403, "forbidden");
  if (opts.write) {
    const origin = headers.get("origin");
    if (origin !== null && origin !== new URL(env.BETTER_AUTH_URL).origin) throw new ConsoleError(403, "cross-origin write");
  }
  return { userId: user.id, name: user.name, role: user.role };
}

// Known errors keep status and message; anything else is a 500 with no detail for the browser.
export function toResponseError(err: unknown): never {
  if (err instanceof ConsoleError) {
    setResponseStatus(err.status);
    throw new Error(err.message);
  }
  console.error("internal error", err);
  setResponseStatus(500);
  throw new Error("internal error");
}

// Expected refusals come back as { ok:false, code } so the UI can show them; anything else still throws.
export async function refusing<T>(
  env: Env,
  headers: Headers,
  opts: { permission?: Permission; write?: boolean },
  run: (actor: Actor) => Promise<T>,
): Promise<T | { ok: false; code: string }> {
  try {
    return await run(await requireActor(env, headers, opts));
  } catch (err) {
    if (err instanceof ConsoleError && (err.status === 401 || err.status === 403)) {
      const code = err.status === 401 ? "unauthorized" : err.message === "forbidden" ? "forbidden" : "bad_origin";
      return { ok: false, code };
    }
    return toResponseError(err);
  }
}
