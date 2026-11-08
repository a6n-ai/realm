import { Suspense } from "react";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { saveTrackedTypes } from "../actions";
import { loadEmailTypes, trackingAvailable } from "../data";
import { LoadErrorAlert, TrackedEmailsForm } from "../email-tracking-section";

export default function TrackedEmailsPage() {
  return (
    <SectionCard title="Tracked emails" subtitle="Turn on the emails that should also record opens and clicks. Applies to emails sent from now on.">
      <Suspense fallback={<FormSkeleton />}>
        <TrackedData />
      </Suspense>
    </SectionCard>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading tracked emails">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

async function TrackedData() {
  if (!trackingAvailable()) {
    return (
      <Alert variant="info">
        <AlertDescription>Open and click tracking isn&apos;t set up for this app yet. Ask your developer to enable it.</AlertDescription>
      </Alert>
    );
  }
  const types = await loadEmailTypes();
  if (types === null) return <LoadErrorAlert message="Couldn't load your email settings." />;
  return <TrackedEmailsForm types={types} onSave={saveTrackedTypes} />;
}
