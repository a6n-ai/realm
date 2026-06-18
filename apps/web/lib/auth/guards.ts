import { AuthError, ForbiddenError, Role } from "@tiffin/commons";
import { auth } from "@/lib/auth";

export async function requireAdmin(): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new AuthError();
  if (session.user.role !== Role.ADMIN) throw new ForbiddenError();
}
