import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Magic-link landing for a staff invite: the link already signed the invitee
// in, so accept here (a route handler, not the page — accepting can rewrite
// the session cookie, which a server component render can't). Absolute
// redirects built on BETTER_AUTH_URL; request.url is the internal host behind
// the proxy.
export async function GET(_req: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params;
  const h = await headers();
  const to = (path: string) => NextResponse.redirect(new URL(path, process.env.BETTER_AUTH_URL));
  try {
    await auth.api.acceptInvitation({ body: { invitationId }, headers: h });
  } catch {
    // Cancelled/expired/someone else's invitation: don't leave them holding a
    // session for an org they never joined (same as the email-code path).
    await auth.api.signOut({ headers: h }).catch(() => {});
    return to(`/accept-invitation/${invitationId}?error=invitation`);
  }
  // No password yet — /set-password finishes setup, then on to /dashboard.
  return to("/set-password");
}
