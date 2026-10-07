import { redirect } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { Role } from "@foundry/commons";
import { FriendsPanel, PageHeader, PageShell } from "@foundry/design-system";
import { getSession } from "@/lib/auth/session";
import { friendsService } from "@/lib/services/friends.service";
import { friendAction, searchFriendsAction } from "./actions";

export default async function FriendsPage() {
  const session = await getSession();
  if (session?.user.role !== Role.USER) redirect("/me");
  const me = session.user.id;
  // The layout also does this, but renders in parallel with this page.
  await friendsService.ensureUsername(me);
  const [lists, ref] = await Promise.all([friendsService.list(me), friendsService.inviteRef(me)]);
  const inviteUrl = ref ? new URL(`/join?ref=${ref}`, process.env.BETTER_AUTH_URL).toString() : null;

  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Friends" subtitle="Find people you know and invite new ones." />
      <FriendsPanel {...lists} inviteUrl={inviteUrl} search={searchFriendsAction} act={friendAction} accountHref="/me/account" />
    </PageShell>
  );
}
