import { redirect } from "next/navigation";
import { NotFoundError, type RoleValue } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";

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
  // Status may have flipped after this session was issued (admin deactivate /
  // self delete). Only `active` accounts keep access.
  if ((user as { status?: string }).status !== "active") redirect("/login");
  return { user, role: session.user.role as RoleValue };
}
