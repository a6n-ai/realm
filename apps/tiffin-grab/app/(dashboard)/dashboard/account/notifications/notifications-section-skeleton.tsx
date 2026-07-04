import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/ds";

// Colocated loading twin for the shared <NotificationsSection>. It lives here
// (not next to the shared component) because we must not edit shared code, and
// mirrors that component's SectionCard + one row per channel so the fallback
// stays shaped like the real content.
const CHANNELS = ["email", "sms"] as const;

export function NotificationsSectionSkeleton() {
  return (
    <section id="notifications" className="scroll-mt-24">
      <SectionCard
        variant="flat"
        title="Notifications"
        subtitle="Choose how we reach you about orders and account updates."
      >
        <div className="grid gap-1">
          {CHANNELS.map((c) => (
            <div key={c} className="flex items-center justify-between gap-4 py-2">
              <div className="grid gap-0.5">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              <Skeleton className="h-[18.4px] w-8 rounded-full" />
            </div>
          ))}
        </div>
      </SectionCard>
    </section>
  );
}
