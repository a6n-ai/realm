import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeftIcon, UserIcon } from "lucide-react";
import { PageShell, PageHeader } from "@/components/ds";
import { AccountSettingsNav } from "@/components/customer/account/account-settings-nav";

export default function CustomerAccountSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell>
      <div className="md:hidden">
        <Link
          href="/me/account"
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          Account
        </Link>
      </div>

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
