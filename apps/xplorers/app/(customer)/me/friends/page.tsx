import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { UserIcon } from "lucide-react";
import { Role } from "@foundry/commons";
import { FriendsPanel, PageHeader, PageShell } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { friendsService } from "@/lib/services/friends.service";
import { ProfileHero } from "@/components/customer/profile/profile-hero";
import { friendAction, searchFriendsAction } from "./actions";

export default async function ProfilePage() {
  const session = await getSession();
  if (session?.user.role !== Role.USER) redirect("/me");
  const me = session.user.id;
  // The layout also does this, but renders in parallel with this page.
  await friendsService.ensureUsername(me);
  const [lists, ref, [u]] = await Promise.all([
    friendsService.list(me),
    friendsService.inviteRef(me),
    db
      .select({
        name: users.name,
        image: users.image,
        displayUsername: users.displayUsername,
      })
      .from(users)
      .where(eq(users.publicId, me))
      .limit(1),
  ]);
  const inviteUrl = ref ? new URL(`/join?ref=${ref}`, process.env.BETTER_AUTH_URL).toString() : null;

  return (
    <PageShell>
      <PageHeader
        icon={UserIcon}
        title="Profile"
        subtitle="Your name, username, invite link, and friends."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/me/account?section=profile">Edit profile</Link>
          </Button>
        }
      />
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <ProfileHero
          name={u?.name ?? session.user.name ?? null}
          username={u?.displayUsername ?? null}
          image={u?.image ?? null}
          editHref="/me/account?section=profile"
        />
        <FriendsPanel
          {...lists}
          inviteUrl={inviteUrl}
          search={searchFriendsAction}
          act={friendAction}
          accountHref="/me/account?section=profile"
        />
      </div>
    </PageShell>
  );
}
