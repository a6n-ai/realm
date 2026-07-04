import { Suspense } from "react";
import { SettingsIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { PageHeader, SectionCard } from "@/components/ds";
import { SettingsForm, SettingsFormSkeleton } from "./settings-form";

export default function GeneralSettingsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader icon={SettingsIcon} title="General" />
      <SectionCard title="Time & cutoff" subtitle="App timezone and order cutoff.">
        <Suspense fallback={<SettingsFormSkeleton />}>
          <SettingsData />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function SettingsData() {
  await requireAdmin();
  const settings = await getAppSettings();
  return <SettingsForm timezone={settings.timezone} cutoffHour={settings.cutoffHour} />;
}
