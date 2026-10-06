import { NextResponse, type NextRequest } from "next/server";
import { Role } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { REF_COOKIE, REF_MAX_AGE, REF_RE } from "@/lib/friends/ref-cookie";

/**
 * Invite link. Only remembers the invite: a GET must never add a friend (any
 * site could embed this URL). The customer accepts on /me with a button.
 */
export async function GET(req: NextRequest) {
  const ref = (req.nextUrl.searchParams.get("ref") ?? "").trim().toLowerCase();
  const session = await getSession();
  const signedIn = Boolean(session?.user);
  const res = NextResponse.redirect(new URL(signedIn ? "/me/friends" : "/signup", req.url));
  if (REF_RE.test(ref) && (!signedIn || session?.user.role === Role.USER)) {
    res.cookies.set(REF_COOKIE, ref, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: REF_MAX_AGE,
      path: "/",
    });
  }
  return res;
}
