import { auth } from "@/lib/auth";

/**
 * Accepts a staff invite for the session carried by `headers`. On failure (cancelled, expired,
 * someone else's) signs back out so the invitee isn't left holding a session for an org they
 * never joined. Returns whether the invite was accepted.
 */
export async function acceptInvitationOrSignOut(invitationId: string, headers: HeadersInit): Promise<boolean> {
  try {
    await auth.api.acceptInvitation({ body: { invitationId }, headers });
    return true;
  } catch {
    await auth.api.signOut({ headers }).catch(() => {});
    return false;
  }
}
