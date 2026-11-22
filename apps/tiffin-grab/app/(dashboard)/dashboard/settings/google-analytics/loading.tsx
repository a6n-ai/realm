import { ChartLineIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { FieldsSkeleton, SettingsPageFrame } from "../_skeletons";

export default function Loading() {
  return (
    <SettingsPageFrame icon={ChartLineIcon} title="Google Analytics" subtitle="Visitors, traffic sources, and conversions in GA4.">
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Connection" subtitle="Changes reach the site within 5 minutes. No redeploy.">
          <FieldsSkeleton />
        </SectionCard>
        <SectionCard title="Check the connection" subtitle="Validates a sample event with Google, then sends it to DebugView only.">
          <Skeleton className="h-9 w-32" />
        </SectionCard>
      </div>
      <SectionCard title="What gets tracked">
        <Skeleton className="h-48 w-full" />
      </SectionCard>
    </SettingsPageFrame>
  );
}
