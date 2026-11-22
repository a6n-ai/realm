import { SettingsIcon } from "lucide-react";
import { SectionCard } from "@/components/ds";
import { SettingsPageFrame } from "../_skeletons";
import { SettingsFormSkeleton } from "./settings-form";

export default function Loading() {
  return (
    <SettingsPageFrame icon={SettingsIcon} title="General">
      <SectionCard title="Time & cutoff" subtitle="App timezone and order cutoff.">
        <SettingsFormSkeleton />
      </SectionCard>
    </SettingsPageFrame>
  );
}
