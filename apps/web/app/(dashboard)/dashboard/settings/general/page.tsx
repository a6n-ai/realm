import { SettingsIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { SettingsForm } from "./settings-form";

export default async function GeneralSettingsPage() {
  await requireAdmin();
  const settings = await getAppSettings();
  return (
    <PageShell>
      <PageHeader icon={SettingsIcon} title="General" subtitle="App timezone and order cutoff" />
      <SectionCard title="Time & cutoff">
        <SettingsForm timezone={settings.timezone} cutoffHour={settings.cutoffHour} />
      </SectionCard>
    </PageShell>
  );
}
