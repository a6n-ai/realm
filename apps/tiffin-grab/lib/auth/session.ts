import { cache } from "react";
import { headers } from "next/headers";
import { Role, type RoleValue } from "@tiffin/commons";
import { auth } from "./index";

function isDynamicServerError(e: unknown): boolean {
  // Next.js throws this (digest "DYNAMIC_SERVER_USAGE") when `headers()` is used
  // during static generation, to mark the route dynamic. It MUST propagate — if we
  // swallow it the route is wrongly prerendered and guards throw at build time.
  return (
    typeof e === "object" && e !== null && "digest" in e &&
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
    if (isDynamicServerError(e)) throw e; // let Next mark the route dynamic
    // Genuine no-request-context (tests, scripts) → treat as unauthenticated.
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
});
