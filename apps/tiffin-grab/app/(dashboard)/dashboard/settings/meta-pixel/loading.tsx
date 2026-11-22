import { MegaphoneIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { FieldsSkeleton, SettingsPageFrame } from "../_skeletons";

export default function Loading() {
  return (
    <SettingsPageFrame icon={MegaphoneIcon} title="Meta Pixel" subtitle="Track visits and conversions for Facebook and Instagram ads.">
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Connection" subtitle="Changes reach the site within 5 minutes. No redeploy.">
          <FieldsSkeleton fields={3} />
        </SectionCard>
        <SectionCard title="Check the connection" subtitle="Sends server events with your test event code.">
          <Skeleton className="h-9 w-32" />
        </SectionCard>
      </div>
      <SectionCard title="What gets tracked" subtitle="Staff pages are never tracked. Server events send hashed email and phone so Meta can match them.">
        <Skeleton className="h-48 w-full" />
      </SectionCard>
    </SettingsPageFrame>
  );
}
