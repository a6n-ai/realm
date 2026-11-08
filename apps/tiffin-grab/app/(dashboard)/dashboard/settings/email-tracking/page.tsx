import { Suspense } from "react";
import Link from "next/link";
import { InfoIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { loadEmailTypes, trackingAvailable } from "./data";
import { trackedStatus } from "./event-names";

const STEPS = [
  "Every email records when it was sent, delivered, bounced or marked as spam. You can see this in Notifications → Logs.",
  "For emails you choose, we also record when it was opened and when a link was clicked.",
  "Opens are a best guess — some mail apps load images automatically, others block them. Clicks are reliable.",
  "Login and security emails are never tracked, so they don't land in spam.",
];

export default function EmailTrackingHowPage() {
  return (
    <SectionCard title="How email tracking works">
      <div className="flex flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Suspense fallback={<Skeleton className="h-12 w-full" />}>
          <TrackedStatus />
        </Suspense>
      </div>
    </SectionCard>
  );
}

async function TrackedStatus() {
  const types = await loadEmailTypes();
  if (types === null) return null;
  const available = trackingAvailable();
  const count = types.filter((t) => t.tracked).length;
  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertDescription>
        {trackedStatus(count, available)}
        {available && (
          <Button asChild variant="link" size="sm">
            <Link href="/dashboard/settings/email-tracking/tracked">{count > 0 ? "Change" : "Choose emails"}</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
