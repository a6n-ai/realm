import { SettingsIcon } from "lucide-react";
import { resolveStatuses } from "@foundry/crm/server";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ds";
import { PLUGINS } from "@/lib/plugins.server";
import { SettingsDirectory } from "./settings-directory";

export default async function SettingsPage() {
  await requireAdmin();
  const statuses = await resolveStatuses(PLUGINS);
  const installed = Object.entries(statuses)
    .filter(([, s]) => s.installed)
    .map(([id]) => id);

  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Configure how the platform runs." />
      <SettingsDirectory installedPluginIds={installed} />
    </>
  );
}
