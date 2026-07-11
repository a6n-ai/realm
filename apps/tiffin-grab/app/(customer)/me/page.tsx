import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SectionCard } from "@realm/design-system";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { HOME_SECTIONS } from "./home-sections";
import { SectionSkeleton } from "./section-skeleton";

// The consumer-app home: a single scroll of session-scoped sections. Each is its
// own Suspense island so a slow read never blocks the rest of the page. Tasks
// 8–12 replace the placeholder <SectionSlot> with each section's real async data
// component (userId + timezone are already threaded for them).
export default async function MePage() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login"); // defense in depth — the (customer) layout already gates

  const { timezone } = await getAppSettings();

  return (
    <main className="space-y-5 px-4 py-6 md:px-6 md:py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Home</h1>
        <p className="text-muted-foreground text-sm text-pretty">Everything for your meals, all in one place.</p>
      </header>

      {HOME_SECTIONS.map((section) => (
        <Suspense key={section.key} fallback={<SectionSkeleton title={section.title} />}>
          <SectionSlot title={section.title} userId={userId} timezone={timezone} />
        </Suspense>
      ))}
    </main>
  );
}

// Placeholder slot — Tasks 8–12 swap this for each section's real async data
// component (subscription · browse · coupons · wallet · analytics).
function SectionSlot({ title }: { title: string; userId: bigint; timezone: string }) {
  return (
    <SectionCard title={title}>
      <p className="text-muted-foreground text-sm">Coming soon.</p>
    </SectionCard>
  );
}
