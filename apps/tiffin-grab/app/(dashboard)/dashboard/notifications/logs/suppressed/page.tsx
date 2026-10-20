import { redirect } from "next/navigation";

// Moved to its own tab; old links and bookmarks keep their filters.
export default async function SuppressedRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => !!e[1])).toString();
  redirect(`/dashboard/notifications/unsubscribed${q ? `?${q}` : ""}`);
}
