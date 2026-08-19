import type { ReactNode } from "react";
import { UserIcon } from "lucide-react";
import { PageShell, PageHeader } from "@/components/ds";
import { BackLink } from "@/components/back-link";
import { AccountSettingsNav } from "@/components/customer/account/account-settings-nav";

export default function CustomerAccountSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell>
      <BackLink href="/me/account" label="Account" />

      <PageHeader
        icon={UserIcon}
        title="Account settings"
        subtitle="Profile, delivery details, and security — each in its own section."
      />

      <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
        <AccountSettingsNav />
        <div className="min-w-0 max-w-2xl">{children}</div>
      </div>
    </PageShell>
  );
}
