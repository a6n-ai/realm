"use server";

import { passwordSchema } from "@realm/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";

// First-login: the signed-in user sets their own password, replacing the issued
// default. Scoped to the session's own id — never a client-supplied user.
export async function setInitialPassword(newPassword: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session?.user) return { error: "Your session has expired. Please sign in again." };
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password" };
  await usersService.setOwnPassword(session.user.id, parsed.data);
  return { ok: true };
}
