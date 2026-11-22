import { UtensilsIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { ResourceEditorSkeleton } from "../[resource]/resource-editor";
import { GroupedResourceTabs } from "../grouped-resource-tabs";
import { TrialSettingsSkeleton } from "./trial-settings-form";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader icon={UtensilsIcon} title="Meal sizes" />
        <SectionCard title="Entries">
          <GroupedResourceTabs
            tabs={[
              { value: "sizes", label: "Sizes", content: <ResourceEditorSkeleton resource="meal-sizes" /> },
              { value: "trial", label: "Trial", content: <TrialSettingsSkeleton /> },
            ]}
          />
        </SectionCard>
      </PageShell>
    </div>
  );
}
