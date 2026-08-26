import { redirect } from "next/navigation";

export default async function LegacyUserDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/organization/users/${id}`);
}
