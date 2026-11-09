import { Suspense } from "react";
import { Skeleton } from "@foundry/ui/skeleton";
import { saveStreamRouting } from "../actions";
import { loadStreams } from "../data";
import { SesRoutingSection } from "../ses-routing-section";

export default function EmailTrackingAdvancedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-8" role="status" aria-label="Loading email routing">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      }
    >
      <AdvancedData />
    </Suspense>
  );
}

async function AdvancedData() {
  return <SesRoutingSection streams={await loadStreams()} onSave={saveStreamRouting} />;
}
