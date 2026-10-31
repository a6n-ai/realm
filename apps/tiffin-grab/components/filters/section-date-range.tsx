import { Suspense } from "react";
import { DefaultDateRange } from "./default-date-range";

/** Date control with a suspense boundary so `useSearchParams` does not opt the page out of streaming. */
export function SectionDateRange({ presets = false }: { presets?: boolean }) {
  return (
    <Suspense fallback={<div className="bg-muted/40 h-10 w-64 animate-pulse rounded-lg" />}>
      <DefaultDateRange presets={presets} />
    </Suspense>
  );
}
