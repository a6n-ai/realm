import { NextResponse, type NextRequest } from "next/server";
import { Role } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { REF_COOKIE, REF_MAX_AGE, REF_RE } from "@/lib/friends/ref-cookie";
import { friendsService } from "@/lib/services/friends.service";

/**
 * Invite link. A signed-in family is befriended right away; anyone else keeps
 * the ref in a cookie through sign-up, and the first /me load settles it.
 */
export async function GET(req: NextRequest) {
  const ref = (req.nextUrl.searchParams.get("ref") ?? "").trim().toLowerCase();
  const valid = REF_RE.test(ref);
  const session = await getSession();
  if (session?.user.role === Role.USER) {
    if (valid) await friendsService.acceptInvite(session.user.id, ref);
    return NextResponse.redirect(new URL("/me/friends", req.url));
  }
  const res = NextResponse.redirect(new URL("/signup", req.url));
  if (valid) {
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
