import { SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/ds";
import { SettingsDirectorySkeleton } from "../settings-directory";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Configure how the platform runs." />
      <SettingsDirectorySkeleton />
    </div>
  );
}
