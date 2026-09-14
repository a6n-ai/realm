import { cache } from "react";
import { headers } from "next/headers";
import { Role, type RoleValue } from "@foundry/commons";
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

export function roleOrCustomer(role: RoleValue | undefined): RoleValue {
  return role ?? Role.USER;
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
  // publicId is an additionalField. cookieCache includes user additionalFields
  // via parseUserOutput; if this is ever missing on a cache hit, disable cookieCache.
  const u = s.user as {
    publicId?: string;
    id: string;
    name?: string | null;
    role?: RoleValue;
    email?: string;
    platformRole?: string | null;
  };
  if (!u.publicId) return null;
  const activeOrganizationId =
    (s.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId ?? null;
  return {
    user: {
      id: u.publicId,
      name: u.name ?? null,
      role: roleOrCustomer(u.role),
      email: u.email ?? "",
      platformRole: u.platformRole ?? null,
    },
    session: { activeOrganizationId },
  };
});
