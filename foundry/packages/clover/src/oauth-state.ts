import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

const COOKIE = "clover_oauth_state";
const MAX_AGE_SEC = 60 * 10;

/** Issue a CSRF state cookie for the Clover OAuth authorize redirect. */
export async function createCloverOAuthState(): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set(COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
  return state;
}

/** Consume and validate the OAuth state cookie (single-use). */
export async function consumeCloverOAuthState(
  expected: string | null | undefined,
): Promise<boolean> {
  const jar = await cookies();
  const stored = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  if (!expected || !stored) return false;
  return stored === expected;
}
