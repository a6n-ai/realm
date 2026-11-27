import type { Env } from "../../env";
import { createAuth } from "./index";

// platformRole is Better Auth's admin-plugin role (super_admin | user); organisation roles live on members.
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  platformRole: string;
  passwordSet: boolean;
  activeOrganizationId: string | null;
};

// Read from D1 on every call (no cookie cache) and refuse any user who is not active.
export async function getSession(env: Env, headers: Headers): Promise<SessionUser | null> {
  const session = await (await createAuth(env)).api.getSession({ headers, query: { disableCookieCache: true } });
  const u = session?.user;
  if (!u || u.status !== "active") return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    platformRole: u.role ?? "user",
    passwordSet: u.passwordSet,
    activeOrganizationId: (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
  };
}
