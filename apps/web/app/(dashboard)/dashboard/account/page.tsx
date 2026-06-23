import { redirect } from "next/navigation";
import { UserIcon } from "lucide-react";
import { NotFoundError, tzToDefaultCountry } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { Badge } from "@/components/ui/badge";
import { AccountForm } from "./account-form";
import { ResendVerification } from "./resend-verification";
import { SignOutButton } from "./sign-out-button";

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
        subtitle="Update your contact details. Phone and email must be unique."
      />
      <SectionCard title="Profile">
        <AccountForm phone={user.phone ?? ""} email={user.email ?? ""} defaultCountry={defaultCountry} />
        {user.email && (
          <div className="mt-3 flex flex-col gap-2 max-w-md">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">Email status:</span>
              {user.emailVerified ? (
                <Badge variant="secondary">Verified</Badge>
              ) : (
                <Badge variant="outline">Unverified</Badge>
              )}
            </div>
            {!user.emailVerified && <ResendVerification email={user.email} />}
          </div>
        )}
      </SectionCard>
      <SectionCard title="Security">
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">Sign out of your account on this device.</p>
          <SignOutButton />
        </div>
      </SectionCard>
    </PageShell>
  );
}
