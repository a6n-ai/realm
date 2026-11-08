import { Suspense } from "react";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { saveStreamRouting } from "../actions";
import { loadStreams } from "../data";
import { SesRoutingSection } from "../ses-routing-section";

export default function EmailTrackingAdvancedPage() {
  return (
    <Suspense
      fallback={
        <SectionCard title="Advanced">
          <div className="flex flex-col gap-3" role="status" aria-label="Loading email routing">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </SectionCard>
      }
    >
      <AdvancedData />
    </Suspense>
  );
}

async function AdvancedData() {
  return <SesRoutingSection streams={await loadStreams()} onSave={saveStreamRouting} />;
}
