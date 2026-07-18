import { cache } from "react";
import { headers } from "next/headers";
import { Role, type RoleValue } from "@realm/commons";
import { auth } from "./index";

function isDynamicServerError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    ((e as { digest: string }).digest === "DYNAMIC_SERVER_USAGE" ||
      (e as { digest: string }).digest.startsWith("DYNAMIC_SERVER_USAGE"))
  );
}

export const getSession = cache(async () => {
  let s: Awaited<ReturnType<typeof auth.api.getSession>> | null;
  try {
    s = await auth.api.getSession({ headers: await headers() });
  } catch (e) {
    if (isDynamicServerError(e)) throw e;
    return null;
  }
  if (!s?.user) return null;
  const u = s.user as { publicId?: string; id: string; role?: RoleValue; email?: string };
  if (!u.publicId) return null;
  return { user: { id: u.publicId, role: u.role ?? Role.ADMIN, email: u.email ?? "" } };
});
