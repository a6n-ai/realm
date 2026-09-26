import { AcceptInvitationForm } from "./accept-invitation-form";

export const dynamic = "force-dynamic";

// Where the magic link sends someone back here: a dead invitation (from
// ./complete) or a spent/expired link (better-auth's ?error=INVALID_TOKEN).
const ERRORS: Record<string, string> = {
  invitation: "This invitation is no longer valid. Contact your admin for a new one.",
};
const LINK_EXPIRED = "That link has expired or was already used. Enter your email to get a code instead.";

export default async function AcceptInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ invitationId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { invitationId } = await params;
  const { error } = await searchParams;

  // Cannot call auth.api.getInvitation here — the invitee has no session yet
  // at this point in the flow and that endpoint requires one (getSessionFromCtx
  // throws UNAUTHORIZED). Same as forgot-password: let the invitee type their
  // own email into the OTP form instead of prefilling/validating it server-side.
  return (
    <AcceptInvitationForm
      invitationId={invitationId}
      initialError={error ? (ERRORS[error] ?? LINK_EXPIRED) : null}
    />
  );
}
