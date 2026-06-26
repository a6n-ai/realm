import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { UserIcon } from "lucide-react";
import type { RoleValue } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/ds";
import { AccountNav } from "./account-nav";

// Settings shell: the page header + the left sub-nav are stable chrome; the
// selected section renders into the constrained right column. Data for each
// section is loaded by that section's page (layouts cannot pass data down).
// Role for the nav comes from the cached session; each page's requireAccountUser
// performs the single user read + stale-user -> /login guard.
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
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
