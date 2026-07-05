"use server";

import { clearLock, setLock } from "./lock";

export async function lockSession(): Promise<void> {
  await setLock();
}

// A full password sign-in supersedes the PIN gate — drop any stale lock cookie
// so the fresh session isn't bounced back to /lock.
export async function clearLockSession(): Promise<void> {
  await clearLock();
}
