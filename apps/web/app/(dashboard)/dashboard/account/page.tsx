import { redirect } from "next/navigation";
import { UserIcon } from "lucide-react";
import { auth } from "@/lib/auth";
import { usersService } from "@/lib/services/users.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await usersService.read(session.user.id);

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
