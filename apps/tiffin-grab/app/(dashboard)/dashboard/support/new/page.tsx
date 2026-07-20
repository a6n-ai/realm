import { redirect } from "next/navigation";

type SearchParams = Promise<{ orderId?: string }>;

/** Old CRM path — customers live under /me after the shell split. */
export default async function LegacyNewTicketRedirect({ searchParams }: { searchParams: SearchParams }) {
  const { orderId } = await searchParams;
  redirect(orderId ? `/me/support/new?orderId=${encodeURIComponent(orderId)}` : "/me/support/new");
}
