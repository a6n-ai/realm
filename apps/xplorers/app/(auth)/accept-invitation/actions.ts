"use server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// headers() throws outside a live request (e.g. a unit test calling this
// action directly with no HTTP request underneath it); better-auth's api
// methods work fine with undefined headers, so fall back rather than crash.
async function requestHeaders(): Promise<HeadersInit> {
  try {
    return await headers();
  } catch {
    return new Headers();
  }
}

export type AcceptInvitationResult = { ok: true } | { ok: false; error: string };

export async function acceptInvitationAction(input: {
  invitationId: string;
  email: string;
  otp: string;
}): Promise<AcceptInvitationResult> {
  const h = await requestHeaders();
  // nextCookies() sets the session cookie by writing to Next's cookies() jar,
  // not by mutating `h` — so acceptInvitation must run with a Headers object
  // that actually carries the Set-Cookie from sign-in, not the pre-signin `h`.
  const signInResult = await auth.api.signInEmailOTP({
    body: { email: input.email, otp: input.otp },
    headers: h,
    returnHeaders: true,
  });
  const sessionHeaders = new Headers(h);
  const cookiePairs = signInResult.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  if (cookiePairs.length > 0) sessionHeaders.set("cookie", cookiePairs.join("; "));
  // xplorers alone enables session.cookieCache: signInEmailOTP writes the
  // session cookie cache from the pre-update in-memory user object, so a
  // previously-unverified invitee's freshly-flipped emailVerified never makes
  // it into that cache. The organization plugin's acceptInvitation gates on
  // session.user.emailVerified, so force it to re-read the DB this once
  // rather than trust the stale cache.
  // The OTP is consumed by now, so a bad/expired invitation must not reuse the
  // "Invalid or expired code" copy — retrying the code can't help. Sign back out
  // so the invitee isn't left holding a session for an org they never joined.
  try {
    await auth.api.acceptInvitation({
      body: { invitationId: input.invitationId },
      headers: sessionHeaders,
      query: { disableCookieCache: true },
    });
  } catch {
    await auth.api.signOut({ headers: sessionHeaders }).catch(() => {});
    return { ok: false, error: "This invitation is no longer valid. Contact your admin for a new one." };
  }
  return { ok: true };
}
