import { Suspense } from "react";
import { SettingsIcon } from "lucide-react";
import { resolveStatuses } from "@foundry/crm/server";
import { PageHeader } from "@/components/ds";
import { PLUGINS } from "@/lib/plugins.server";
import { SettingsDirectory, SettingsDirectorySkeleton } from "./settings-directory";

export default async function SettingsPage() {
  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Configure how the platform runs." />
      <Suspense fallback={<SettingsDirectorySkeleton />}>
        <SettingsDirectoryLoader />
      </Suspense>
    </>
  );
}

// Plugin statuses read config (and may open secrets), so the directory streams in behind its skeleton.
async function SettingsDirectoryLoader() {
  const statuses = await resolveStatuses(PLUGINS);
  const installed = Object.entries(statuses)
    .filter(([, s]) => s.installed)
    .map(([id]) => id);
  return <SettingsDirectory installedPluginIds={installed} />;
}
