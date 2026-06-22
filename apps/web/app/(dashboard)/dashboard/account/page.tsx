import { redirect } from "next/navigation";
import { UserIcon } from "lucide-react";
import { NotFoundError, tzToDefaultCountry } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  // A JWT session can outlive its user row (e.g. the dev DB was reseeded). Treat
  // a missing session user as an expired session and send them back to sign in.
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
        subtitle="Update your contact details. Phone and email must be unique."
      />
      <SectionCard title="Profile">
        <AccountForm phone={user.phone ?? ""} email={user.email ?? ""} defaultCountry={defaultCountry} />
      </SectionCard>
    </PageShell>
  );
}
