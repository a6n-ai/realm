import { ClockIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { CRON_JOBS } from "@/lib/cron/jobs";
import { SettingsPageFrame } from "../../_skeletons";

export default function Loading() {
  return (
    <SettingsPageFrame
      icon={ClockIcon}
      title="Scheduled jobs"
      subtitle="What runs on its own or by hand. Open a job to run it and see its history."
    >
      <ul className="bg-card divide-y rounded-xl border">
        {CRON_JOBS.map((job) => (
          <li key={job.key} className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-5 w-24" />
          </li>
        ))}
      </ul>
    </SettingsPageFrame>
  );
}
