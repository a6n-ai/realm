import { type RoleValue } from "@tiffin/commons";
import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";

// The token/session only ever carry the user's public id (`usr_…`) string —
// never the internal bigint `users.id`, which exceeds JS safe-int and must
// stay server-side.
export function jwtCallback({ token, user }: { token: JWT; user?: User }): JWT {
  if (user) {
    token.id = (user as { publicId?: string }).publicId ?? user.id;
    token.role = (user as { role: RoleValue }).role;
  }
  return token;
}

export function sessionCallback({ session, token }: { session: Session; token: JWT }): Session {
  if (session.user) {
    session.user.id = (token.id as string | undefined) ?? session.user.id;
    session.user.role = (token.role as RoleValue | undefined) ?? session.user.role;
  }
  return session;
}
