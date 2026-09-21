import { permanentRedirect } from "next/navigation";

// The deliveries hub is /me now; keep old bookmarks and emails alive with the query intact.
export default async function LegacyDeliveriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) p.append(k, x);
  const qs = p.toString();
  permanentRedirect(qs ? `/me?${qs}` : "/me");
}
