import { SettingsIcon } from "lucide-react";
import { PageHeader, SectionCard } from "@foundry/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppClock } from "@/lib/services/app-settings.service";
import { SettingsForm } from "./settings-form";

export default async function GeneralSettingsPage() {
  await requireAdmin();
  const clock = await getAppClock();
  return (
    <div className="grid gap-6">
      <PageHeader icon={SettingsIcon} title="General" subtitle="Timezone and currency for the whole studio." />
      <SectionCard title="Time & money">
        <SettingsForm timezone={clock.timezone} currency={clock.currency} />
      </SectionCard>
    </div>
  );
}
