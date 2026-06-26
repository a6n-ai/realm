import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { UserIcon } from "lucide-react";
import { NotFoundError, type RoleValue } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { PageShell, PageHeader } from "@/components/ds";
import { AccountNav } from "./account-nav";

// Settings shell: the page header + the left sub-nav are stable chrome; the
// selected section renders into the constrained right column. Data for each
// section is loaded by that section's page (layouts cannot pass data down).
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  try {
    await usersService.read(session.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/login");
    throw err;
  }
  const role = session.user.role as RoleValue;

  return (
    <PageShell>
      <PageHeader
        icon={UserIcon}
        title="Account"
        subtitle="Manage your profile, contact details, and security settings."
      />
      <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
        <AccountNav role={role} />
        <div className="min-w-0 max-w-2xl">{children}</div>
      </div>
    </PageShell>
  );
}
