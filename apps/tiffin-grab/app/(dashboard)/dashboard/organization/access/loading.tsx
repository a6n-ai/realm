import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";

export default function AccessLoading() {
  return (
    <SectionCard title="Access">
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </SectionCard>
  );
}
