import { SectionCard } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";

export function DeliveryNotesSkeleton() {
  return (
    <section id="delivery-notes" className="scroll-mt-24">
      <SectionCard
        variant="flat"
        title="Delivery notes"
        subtitle="Help the driver find you — gate code, drop-off spot, or a nearby landmark."
      >
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Skeleton className="h-[68px] w-full" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-9 w-full min-w-32 sm:w-32" />
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
