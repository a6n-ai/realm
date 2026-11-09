"use client";
import { parseIsoDate } from "@/lib/dates/iso-date";
import { appTodayIso } from "@/lib/dates/today";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { AlertTriangleIcon, TruckIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { DispatchTabs } from "../dispatch-tabs";

// Scoped to this route segment so a render crash here doesn't bounce staff out of
// Dispatch entirely — they keep the tab bar and can jump to another tab instead of
// landing on the generic dashboard-wide error page with no way back in.
export default function DriversError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useSearchParams();
  const tz = useTimezone();
  const [today] = useState(() => appTodayIso(tz));
  const dateParam = params.get("date");
  const date = parseIsoDate(dateParam) ?? today;

  return (
    <PageShell>
      <PageHeader icon={TruckIcon} title="Dispatch" subtitle="Today's routes and driver assignments." />
      <DispatchTabs date={date} />
      <SectionCard title="Drivers unavailable">
        <div className="flex items-start gap-2">
          <AlertTriangleIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="text-muted-foreground text-sm">
              This tab failed to load. Try again, or check another tab.
            </p>
            {error.digest ? (
              <p className="text-muted-foreground mt-1 text-xs">Ref: {error.digest}</p>
            ) : null}
          </div>
        </div>
        <Button onClick={reset} className="mt-3">Try again</Button>
      </SectionCard>
    </PageShell>
  );
}
