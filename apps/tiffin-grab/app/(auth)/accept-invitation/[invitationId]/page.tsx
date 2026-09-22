import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { AcceptInvitationForm } from "./accept-invitation-form";

export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const { invitationId } = await params;

  let email: string;
  try {
    const invitation = await auth.api.getInvitation({ query: { id: invitationId }, headers: await headers() });
    email = invitation.email;
  } catch {
    notFound();
  }

  return <AcceptInvitationForm invitationId={invitationId} email={email} />;
}
