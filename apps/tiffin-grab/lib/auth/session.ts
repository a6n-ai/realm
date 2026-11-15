import { cache } from "react";
import { headers } from "next/headers";
import { createGetSession } from "@foundry/auth/session";
import { ensureActiveOrganization } from "@foundry/auth";
import { isCustomerRole } from "@/lib/roles";
import { auth } from "./index";

// `auth` is read per call: lib/auth/index.ts reaches this module through a cycle, so it can still be unset at load.
const baseSession = createGetSession({ auth: { api: { getSession: (ctx) => auth.api.getSession(ctx) } } });

// Staff sessions with no active org get their first membership activated. The id is merged into
// the cached session because Better Auth's cookie cache keeps serving the null for up to 5 minutes,
// and every guard and visibility check in this request must see the activated org.
export const getSession = cache(async () => {
  const s = await baseSession();
  if (!s || s.session.activeOrganizationId || isCustomerRole(s.user.role)) return s;
  const activeOrganizationId = await ensureActiveOrganization(auth.api, await headers());
  return activeOrganizationId ? { ...s, session: { ...s.session, activeOrganizationId } } : s;
});
