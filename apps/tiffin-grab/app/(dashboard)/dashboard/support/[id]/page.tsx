import { redirect } from "next/navigation";

/** Old CRM path — customers live under /me after the shell split. */
export default async function LegacyTicketRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/me/support/${id}`);
}
