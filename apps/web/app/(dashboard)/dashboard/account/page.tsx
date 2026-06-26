import { redirect } from "next/navigation";
import { UserIcon } from "lucide-react";
import { NotFoundError, tzToDefaultCountry, type RoleValue } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { PageShell, PageHeader } from "@/components/ds";
import { AccountSettings } from "@/components/account/account-settings";

export default async function AccountPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  // A session can reference a user row that no longer exists (e.g. the dev DB was
  // reseeded). Treat a missing user as an expired session and send them back to sign in.
  let user;
  try {
    user = await usersService.read(session.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }

  const { timezone } = await getAppSettings();
  const defaultCountry = tzToDefaultCountry(timezone);

  return (
    <PageShell>
      <PageHeader
        icon={UserIcon}
        title="Account"
        subtitle="Manage your profile, contact details, and security settings."
      />
      <AccountSettings
        role={session.user.role as RoleValue}
        user={user}
        defaultCountry={defaultCountry}
      />
    </PageShell>
  );
}
