import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | undefined>>;

// The invites filter moved to People as ?invite=, since ?status= filters people there.
export default async function InvitesRedirect({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const query = sp.status ? `?invite=${encodeURIComponent(sp.status)}` : "";
  redirect(`/dashboard/organization/people${query}`);
}
