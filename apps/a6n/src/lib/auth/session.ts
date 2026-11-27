import type { Env } from "../../env";
import { createAuth } from "./index";
import type { Role } from "./permissions";

export type SessionUser = { id: string; name: string; email: string; role: Role; passwordSet: boolean };

// Read from D1 on every call (no cookie cache) and refuse any user who is not active.
export async function getSession(env: Env, headers: Headers): Promise<SessionUser | null> {
  const session = await createAuth(env).api.getSession({ headers, query: { disableCookieCache: true } });
  const u = session?.user;
  if (!u || u.status !== "active") return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role, passwordSet: u.passwordSet };
}
