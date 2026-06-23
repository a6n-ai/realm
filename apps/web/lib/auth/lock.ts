import { cookies } from "next/headers";

export const LOCK_COOKIE = "tg_locked";

export async function isLocked(): Promise<boolean> {
  return (await cookies()).get(LOCK_COOKIE)?.value === "1";
}

export async function setLock(): Promise<void> {
  (await cookies()).set(LOCK_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
}

export async function clearLock(): Promise<void> {
  (await cookies()).delete(LOCK_COOKIE);
}
