import { UsersIcon } from "lucide-react";
import { SettingsPageFrame } from "../_skeletons";
import { OwnerAssignmentSkeleton } from "./owner-assignment-skeleton";

export default function Loading() {
  return (
    <SettingsPageFrame icon={UsersIcon} title="Owner assignment" subtitle="Who new leads, orders and tickets go to.">
      <OwnerAssignmentSkeleton />
    </SettingsPageFrame>
  );
}
