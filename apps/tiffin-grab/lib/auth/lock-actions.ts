"use server";

import { setLock } from "./lock";

export async function lockSession(): Promise<void> {
  await setLock();
}
