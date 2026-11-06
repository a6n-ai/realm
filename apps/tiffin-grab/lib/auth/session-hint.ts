import type { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIES, SESSION_HINT_COOKIE } from "./cookie-prefix";

const MAX_AGE_S = 30 * 24 * 60 * 60; // same as the session (lib/auth/index.ts SESSION_MAX_AGE_S)

/** Sets or clears the hint only when it disagrees with the session cookie, so a steady visitor's
 *  responses carry no Set-Cookie (which would keep them out of any shared cache). Presence only,
 *  like Better Auth's getSessionCookie: an expired cookie still hints, costing one get-session. */
export function syncSessionHint(request: NextRequest, res: NextResponse): void {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  const hinted = request.cookies.get(SESSION_HINT_COOKIE)?.value === "1";
  if (hasSession === hinted) return;
  const domain = process.env.AUTH_COOKIE_DOMAIN;
  res.cookies.set(SESSION_HINT_COOKIE, hasSession ? "1" : "", {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: hasSession ? MAX_AGE_S : 0,
    ...(domain ? { domain } : {}),
  });
}
