import { redirect } from "next/navigation";
import { FriendsPanel } from "@foundry/design-system";
import { getSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/customer/kit";
import { BackLink } from "@/components/customer/support/parts";
import { friendsService } from "@/lib/services/friends.service";
import { friendAction, searchFriendsAction } from "./actions";

// Matches the kit's quiet pill so the shared panel sits in the customer look.
const KIT_BUTTON =
  "inline-flex h-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50";

export default async function FriendsPage() {
  const session = await getSession();
  if (session?.user.role !== "user") redirect("/me");
  const me = session.user.id;
  // The layout also does this, but renders in parallel with this page.
  await friendsService.ensureUsername(me);
  const [lists, ref] = await Promise.all([friendsService.list(me), friendsService.inviteRef(me)]);
  const inviteUrl = ref ? new URL(`/join?ref=${ref}`, process.env.BETTER_AUTH_URL).toString() : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/me/account" label="Account" />
      <PageHeader eyebrow="Friends" title="Eat with" accent="friends" subtitle="Find people you know and invite new ones." />
      <FriendsPanel
        {...lists}
        inviteUrl={inviteUrl}
        search={searchFriendsAction}
        act={friendAction}
        buttonClassName={KIT_BUTTON}
        accountHref="/me/account?section=profile"
      />
    </div>
  );
}
