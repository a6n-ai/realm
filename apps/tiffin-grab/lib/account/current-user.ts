import { redirect } from "next/navigation";
import { NotFoundError, type RoleValue } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";

/**
 * The one "signed in and account active" gate, given a session's user id. A session that outlives its
 * user row (dev DB reseeded) is expired; a status flipped after the session was issued (suspend,
 * deactivate, self delete) ends it on the read path, not only at the next sign-in.
 */
export async function requireActiveUser(userId: string, read: (id: string) => ReturnType<typeof usersService.read> = (id) => usersService.read(id)) {
  let user;
  try {
    user = await read(userId);
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }
  if (user.status !== "active") redirect("/login?suspended=1");
  return user;
}

// Shared loader for the account section pages. getSession is React-cached, so the
// repeated calls across layout + page collapse to one.
export async function requireAccountUser() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  const user = await requireActiveUser(session.user.id);
  return { user, role: session.user.role as RoleValue };
}
