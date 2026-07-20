import type { ReactNode } from "react";
import { AccountSettingsTabs } from "@/components/customer/account/account-settings-tabs";

export default function CustomerAccountSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Account settings</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Profile, delivery details, and security — each in its own section.
        </p>
      </header>

      <div className="hidden md:block">
        <AccountSettingsTabs />
      </div>

      <div className="min-w-0 max-w-2xl">{children}</div>
    </main>
  );
}
