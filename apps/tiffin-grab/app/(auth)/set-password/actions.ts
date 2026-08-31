"use server";

import { ValidationError } from "@foundry/commons";
import { passwordSchema } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";

// First-login: the signed-in user sets their own password, replacing the issued
// default. Scoped to the session's own id — never a client-supplied user.
export async function setInitialPassword(newPassword: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session?.user) return { error: "Your session has expired. Please sign in again." };
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password" };
  try {
    await usersService.setOwnPassword(session.user.id, parsed.data);
  } catch (e) {
    // A rejected precondition is a message for the user, not a crash. Letting a
    // ValidationError escape a server action renders as an opaque 500 + digest,
    // which is what the "already have a password" guard originally did.
    // Anything unexpected still throws so it is not silently swallowed.
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  return { ok: true };
}
