import type { ReactNode } from "react";
import { SettingsIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { SettingsTabs } from "./settings-tabs";

// Settings shell: the page header + the top-tab nav are stable chrome. Every
// section is admin-only, so the guard lives here once (each page keeps its own
// requireAdmin for defense in depth). Layouts can't pass data down, so each
// section's page loads its own data and renders only its SectionCards.
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <PageShell>
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        subtitle="Configure how the platform runs."
      />
      <SettingsTabs />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
