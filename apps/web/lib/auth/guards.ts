import { AuthError, ForbiddenError, Role, type RoleValue } from "@tiffin/commons";
import { getSession } from "./session";

async function requireSession() {
  const session = await getSession();
  if (!session?.user) throw new AuthError();
  return session.user as { role: RoleValue };
}

export async function requireRole(...roles: RoleValue[]): Promise<void> {
  const user = await requireSession();
  if (!roles.includes(user.role)) throw new ForbiddenError();
}

export async function requireAdmin(): Promise<void> {
  await requireRole(Role.ADMIN);
}

export async function requireStaff(): Promise<void> {
  await requireRole(Role.ADMIN, Role.MEMBER);
}
