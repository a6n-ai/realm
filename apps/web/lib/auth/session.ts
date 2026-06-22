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
  // u.id is Better Auth's own UUID PK, never the internal DB bigint, so the
  // `?? u.id` fallback cannot leak the bigint; publicId is the normal path.
  return { user: { id: u.publicId ?? u.id, role: u.role ?? Role.USER, email: u.email ?? "" } };
}
