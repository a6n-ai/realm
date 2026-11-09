import { SectionCard } from "@/components/ds";
import { Skeleton } from "@foundry/ui/skeleton";
import { PinForm } from "@foundry/auth-ui";
import { setMyPin, removeMyPin } from "@/lib/account/actions";

export function PinSection({ hasPin, titleAs }: { hasPin: boolean; titleAs?: "h2" | "h3" }) {
  return (
    <section id="pin" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="PIN">
        <PinForm hasPin={hasPin} onSetPin={setMyPin} onRemovePin={removeMyPin} />
      </SectionCard>
    </section>
  );
}

PinSection.Skeleton = function PinSectionSkeleton({ titleAs }: { titleAs?: "h2" | "h3" }) {
  return (
    <section id="pin" className="scroll-mt-24">
      <SectionCard variant="flat" titleAs={titleAs} title="PIN">
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="grid max-w-md gap-3">
            <div className="grid gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
            {["New PIN", "Confirm PIN"].map((label) => (
              <div key={label} className="grid gap-1.5">
                <Skeleton className="h-4 w-20" />
                <div className="flex gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="size-12 rounded-md" />
                  ))}
                </div>
              </div>
            ))}
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </SectionCard>
    </section>
  );
};
