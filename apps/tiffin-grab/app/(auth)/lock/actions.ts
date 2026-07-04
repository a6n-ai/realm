"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth/session";
import { clearLock } from "@/lib/auth/lock";
import { usersService } from "@/lib/services/users.service";

export async function verifyPinAction(pin: string): Promise<{ ok: boolean; forcePassword?: boolean }> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, forcePassword: true };
  const res = await usersService.verifyPin(session.user.id, pin);
  if (res.ok) {
    await clearLock();
    return { ok: true };
  }
  if (res.forcePassword) {
    await clearLock();
    await auth.api.signOut({ headers: await headers() });
    return { ok: false, forcePassword: true };
  }
  return { ok: false };
}
