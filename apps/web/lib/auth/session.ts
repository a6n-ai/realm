import { headers } from "next/headers";
import { Role, type RoleValue } from "@tiffin/commons";
import { auth } from "./index";

export async function getSession() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s?.user) return null;
  const u = s.user as { publicId?: string; id: string; role?: RoleValue; email?: string };
  return { user: { id: u.publicId ?? u.id, role: u.role ?? Role.USER, email: u.email ?? "" } };
}
