import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function MembersRedirect({ searchParams }: { searchParams: SearchParams }) {
  const qs = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => e[1] !== undefined));
  const query = qs.toString();
  redirect(query ? `/dashboard/organization/people?${query}` : "/dashboard/organization/people");
}
