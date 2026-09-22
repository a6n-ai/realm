import { AcceptInvitationForm } from "./accept-invitation-form";

export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;

  // Cannot call auth.api.getInvitation here — the invitee has no session yet
  // at this point in the flow and that endpoint requires one (getSessionFromCtx
  // throws UNAUTHORIZED). Same as forgot-password: let the invitee type their
  // own email into the OTP form instead of prefilling/validating it server-side.
  return <AcceptInvitationForm invitationId={invitationId} />;
}
