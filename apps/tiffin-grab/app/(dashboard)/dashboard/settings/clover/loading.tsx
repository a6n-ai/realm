import { CreditCardIcon } from "lucide-react";
import { CloverSettingsPanelSkeleton } from "@foundry/clover/ui";
import { SettingsPageFrame } from "../_skeletons";

export default function Loading() {
  return (
    <SettingsPageFrame
      icon={CreditCardIcon}
      title="Clover"
      subtitle="Settings for the Clover plugin installed under Integrations."
    >
      <CloverSettingsPanelSkeleton />
    </SettingsPageFrame>
  );
}
