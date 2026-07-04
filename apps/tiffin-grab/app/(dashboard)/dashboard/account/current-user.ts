import { redirect } from "next/navigation";
import { NotFoundError, type RoleValue } from "@realm/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { isSectionAllowed } from "./nav.config";

// Shared loader for the account section pages. getSession is React-cached, so the
// repeated calls across layout + page collapse to one. A session that outlives
// its user row (dev DB reseeded) is treated as expired.
export async function requireAccountUser() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  let user;
  try {
    user = await usersService.read(session.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }
  return { user, role: session.user.role as RoleValue };
}

// Loads the user and enforces that the role may see this section. A role that
// lacks the section is sent back to its first section (every role has profile)
// rather than shown a 404 — the deep link simply degrades gracefully.
export async function requireSectionAccess(key: string) {
  const ctx = await requireAccountUser();
  if (!isSectionAllowed(ctx.role, key)) redirect("/dashboard/account/profile");
  return ctx;
}
