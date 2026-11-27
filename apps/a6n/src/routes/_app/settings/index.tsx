import { Input } from "@foundry/ui/input";
import { createFileRoute } from "@tanstack/react-router";
import { SettingsCard } from "../../../components/page/settings-card";

export const Route = createFileRoute("/_app/settings/")({ component: GeneralPage });

function GeneralPage() {
  return (
    <SettingsCard title="Workspace name" description="The name of this a6n workspace." footer="Read-only for now.">
      <Input readOnly value="a6n" aria-label="Workspace name" className="max-w-sm" />
    </SettingsCard>
  );
}
