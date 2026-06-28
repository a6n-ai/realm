import { SettingsIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { PageHeader, SectionCard } from "@/components/ds";
import { SettingsForm } from "./settings-form";

export default async function GeneralSettingsPage() {
  await requireAdmin();
  const settings = await getAppSettings();
  return (
    <div className="grid gap-6">
      <PageHeader icon={SettingsIcon} title="General" />
      <SectionCard title="Time & cutoff" subtitle="App timezone and order cutoff.">
        <SettingsForm timezone={settings.timezone} cutoffHour={settings.cutoffHour} />
      </SectionCard>
    </div>
  );
}
