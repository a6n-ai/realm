import { headers } from "next/headers";
import { Role, type RoleValue } from "@tiffin/commons";
import { auth } from "./index";

export async function getSession() {
  let s: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  try {
    s = await auth.api.getSession({ headers: await headers() });
  } catch {
    // No request context (tests, scripts, build-time) → treat as unauthenticated.
    return null;
  }
  if (!s?.user) return null;
  const u = s.user as { publicId?: string; id: string; role?: RoleValue; email?: string };
  // Better Auth returns `u.id` as the stringified internal bigint users.id (the adapter
  // maps onto our table with generateId:false), which must NEVER leave the server. We
  // expose `publicId` (usr_…) only. publicId is a NOT NULL column always surfaced as an
  // additionalField, so if it is somehow absent we fail closed (treat as no session)
  // rather than leak the bigint.
  if (!u.publicId) return null;
  return { user: { id: u.publicId, role: u.role ?? Role.USER, email: u.email ?? "" } };
}
