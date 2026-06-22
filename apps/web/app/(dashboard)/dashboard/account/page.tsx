import { redirect } from "next/navigation";
import { UserIcon } from "lucide-react";
import { NotFoundError } from "@tiffin/commons";
import { auth } from "@/lib/auth";
import { usersService } from "@/lib/services/users.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const session = await auth();
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

  return (
    <PageShell>
      <PageHeader
        icon={UserIcon}
        title="Account"
        subtitle="Update your contact details. Phone and email must be unique."
      />
      <SectionCard title="Profile">
        <AccountForm phone={user.phone ?? ""} email={user.email ?? ""} />
      </SectionCard>
    </PageShell>
  );
}
