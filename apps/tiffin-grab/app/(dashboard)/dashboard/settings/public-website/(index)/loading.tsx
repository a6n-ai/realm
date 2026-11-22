import { HelpCircleIcon } from "lucide-react";
import { SkeletonCardGrid } from "@/components/ds";
import { SettingsPageFrame } from "../../_skeletons";

export default function Loading() {
  return (
    <SettingsPageFrame icon={HelpCircleIcon} title="Public Website" subtitle="Content shown on the public site, editable without a deploy.">
      <SkeletonCardGrid count={1} className="sm:grid-cols-2 lg:grid-cols-3" />
    </SettingsPageFrame>
  );
}
