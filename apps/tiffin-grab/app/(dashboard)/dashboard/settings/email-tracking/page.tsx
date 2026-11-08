import { Suspense } from "react";
import { createLogger } from "@foundry/commons/logger";
import { sesEventSettings } from "@relay/email";
import { MailCheckIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { eventLabel } from "@relay/engine/ui/template-status";
import { PageHeader, SectionCard } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { emailStreams } from "@/lib/email/provider";
import { CATEGORY_LABEL, eventCategory } from "@/lib/notifications/event-categories";
import { NOTIFICATION_EVENTS } from "@/lib/notifications/event-list";
import { emailVolumeByStream } from "@/lib/notifications/email-volume";
import { getTrackedEmailEvents } from "@/lib/services/app-settings.service";
import { saveStreamRouting, saveTrackedTypes } from "./actions";
import type { EmailTypeRow } from "./email-tracking-section";
import { EmailTrackingSettings } from "./email-tracking-settings";
import { SesRoutingSection, type StreamState } from "./ses-routing-section";

const log = createLogger("email-events-page");

export default function EmailTrackingPage() {
  return (
    <div className="grid gap-6">
      <PageHeader icon={MailCheckIcon} title="Email tracking" subtitle="Opens, clicks and delivery records for emails." />
      <Suspense fallback={<EmailTrackingSkeleton />}>
        <EmailEventsData />
      </Suspense>
    </div>
  );
}

function EmailTrackingSkeleton() {
  return (
    <div className="flex flex-col gap-6 md:flex-row" role="status" aria-label="Loading email tracking settings">
      <div className="flex gap-2 md:w-48 md:shrink-0 md:flex-col">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-28 md:w-full" />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <SectionCard title="Email tracking">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

async function EmailEventsData() {
  await requireAdmin();
  const streams = emailStreams();
  const provider = sesEventSettings();
  const [tracked, volume, states] = await Promise.all([
    getTrackedEmailEvents().catch((e) => {
      log.error({ err: e }, "getTrackedEmailEvents failed");
      return null;
    }),
    emailVolumeByStream(streams).catch((e) => {
      log.error({ err: e }, "emailVolumeByStream failed");
      return {} as Awaited<ReturnType<typeof emailVolumeByStream>>;
    }),
    Promise.all(
      streams.map(async (stream): Promise<Omit<StreamState, "volume">> => {
        try {
          return { stream, routing: await provider.getRouting(stream) };
        } catch (e) {
          log.error({ err: e, stream: stream.id }, "getRouting failed");
          return {
            stream,
            routing: { webhook: [], counts: null },
            error: "Couldn't load this stream's settings.",
          };
        }
      }),
    ),
  ]);

  const trackedSet = new Set(tracked ?? []);
  const types: EmailTypeRow[] = NOTIFICATION_EVENTS.map((event) => {
      const category = eventCategory(event);
      return {
        event,
        label: eventLabel(event),
        category,
        categoryLabel: CATEGORY_LABEL[category],
        tracked: trackedSet.has(event),
        locked: category === "account",
      };
    });

  const streamStates: StreamState[] = states.map((s) => ({ ...s, volume: volume[s.stream.id] ?? {} }));

  return (
    <EmailTrackingSettings
      types={types}
      loadFailed={tracked === null}
      trackingAvailable={streams.some((s) => s.kind === "tracked")}
      streams={streamStates}
      onSaveTracked={saveTrackedTypes}
      onSaveRouting={saveStreamRouting}
    />
  );
}
