import { AppError } from "@foundry/commons/errors";
import type { Env } from "../../env";
import { getDb } from "../../db/client";
import { resolveMembership } from "./membership";
import type { Permission } from "./permissions";
import { getSession } from "./session";

export type Actor = { userId: string; name: string; organizationId: string; role: string; permissions: Permission[] };

export class ConsoleError extends AppError {
  constructor(status: 400 | 401 | 403 | 404 | 409 | 422 | 429, message: string) {
    super(message, status);
  }
}

export async function requireActor(
  env: Env,
  headers: Headers,
  opts: { permission?: Permission; write?: boolean } = {},
): Promise<Actor> {
  const user = await getSession(env, headers);
  if (!user) throw new ConsoleError(401, "unauthorized");
  const m = await resolveMembership(getDb(env), user.id, user.activeOrganizationId);
  if (!m) throw new ConsoleError(409, "no_organization");
  if (opts.permission && !m.permissions.includes(opts.permission)) throw new ConsoleError(403, "forbidden");
  if (opts.write) {
    const origin = headers.get("origin");
    if (origin !== null && origin !== new URL(env.BETTER_AUTH_URL).origin) throw new ConsoleError(403, "bad_origin");
  }
  return { userId: user.id, name: user.name, organizationId: m.organizationId, role: m.role, permissions: m.permissions };
}

// Platform pages: anyone but a super admin gets 404, so the page's existence is not revealed.
export async function requirePlatformAdmin(env: Env, headers: Headers, opts: { write?: boolean } = {}): Promise<{ userId: string; name: string }> {
  const user = await getSession(env, headers);
  if (!user || user.platformRole !== "super_admin") throw new ConsoleError(404, "not found");
  if (opts.write) {
    const origin = headers.get("origin");
    if (origin !== null && origin !== new URL(env.BETTER_AUTH_URL).origin) throw new ConsoleError(403, "bad_origin");
  }
  return { userId: user.id, name: user.name };
}
