import { TruckIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { SettingsPageFrame } from "../_skeletons";

export default function Loading() {
  return (
    <SettingsPageFrame
      icon={TruckIcon}
      title="OptimoRoute"
      subtitle="Settings for the OptimoRoute plugin installed under Integrations."
    >
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-16 w-full" />
      <div className="space-y-2">
        <h2 className="text-sm font-medium">Driver codes</h2>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    </SettingsPageFrame>
  );
}
