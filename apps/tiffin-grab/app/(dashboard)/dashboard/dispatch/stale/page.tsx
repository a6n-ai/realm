import { redirect } from "next/navigation";

type SearchParams = Promise<{ date?: string }>;

// Folded into the Day view. Kept so old bookmarks land on the matching filter.
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { date } = await searchParams;
  const sp = new URLSearchParams({ view: "needs_action" });
  if (date) sp.set("date", date);
  redirect(`/dashboard/dispatch?${sp.toString()}`);
}
