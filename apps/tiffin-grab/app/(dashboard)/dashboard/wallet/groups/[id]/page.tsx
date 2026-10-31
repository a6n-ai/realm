import { redirect } from "next/navigation";

export default async function WalletGroupRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/customer-groups/${id}`);
}
