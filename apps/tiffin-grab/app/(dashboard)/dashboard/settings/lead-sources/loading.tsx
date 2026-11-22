import { Webhook } from "lucide-react";
import { SettingsPageFrame } from "../_skeletons";
import { LeadSourcesManagerSkeleton } from "./manager";

export default function Loading() {
  return (
    <SettingsPageFrame icon={Webhook} title="Lead sources">
      <LeadSourcesManagerSkeleton />
    </SettingsPageFrame>
  );
}
