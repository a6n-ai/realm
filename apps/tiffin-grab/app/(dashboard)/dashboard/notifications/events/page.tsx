import { Suspense } from "react";
import { createLogger } from "@foundry/commons/logger";
import { sesEventSettings } from "@relay/email";
import { InfoIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { eventLabel } from "@relay/engine/ui/template-status";
import { SectionCard } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { emailStreams } from "@/lib/email/provider";
import { CATEGORY_LABEL, eventCategory } from "@/lib/notifications/event-categories";
import { NOTIFICATION_EVENTS } from "@/lib/notifications/event-list";
import { emailVolumeByStream } from "@/lib/notifications/email-volume";
import { getTrackedEmailEvents } from "@/lib/services/app-settings.service";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { saveStreamRouting, saveTrackedTypes } from "./actions";
import { EmailTrackingSection, LoadErrorAlert, type EmailTypeRow } from "./email-tracking-section";
import { SesRoutingSection, type StreamState } from "./ses-routing-section";

const log = createLogger("email-events-page");

export default function EmailEventsPage() {
  return (
    <Suspense fallback={<EmailEventsSkeleton />}>
      <EmailEventsData />
    </Suspense>
  );
}

function EmailEventsSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading email event settings">
      <Skeleton className="h-12 w-full" />
      <SectionCard title="Email tracking" subtitle="Choose which emails track opens and clicks.">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </SectionCard>
      <Skeleton className="h-12 w-full" />
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
  const hasTracked = streams.some((s) => s.kind === "tracked");

  return (
    <div className="flex flex-col gap-6">
      <Alert variant="info">
        <InfoIcon />
        <AlertDescription>
          {hasTracked
            ? "Every email records Sent, Delivered, Bounced and Marked as spam. Turn on tracking to also see Opened and Clicked in Logs."
            : "Every email records Sent, Delivered, Bounced and Marked as spam."}
        </AlertDescription>
      </Alert>
      <SectionCard title="Email tracking" subtitle="Choose which emails track opens and clicks.">
        {!hasTracked ? (
          <Alert variant="info">
            <AlertDescription>Open and click tracking isn&apos;t set up for this app yet. Ask your developer to enable it.</AlertDescription>
          </Alert>
        ) : tracked === null ? (
          <LoadErrorAlert message="Couldn't load your email settings." />
        ) : (
          <EmailTrackingSection types={types} onSave={saveTrackedTypes} />
        )}
      </SectionCard>
      {streams.length > 0 && (
        <SectionCard title="Developer options" subtitle="For developers and support.">
          <SesRoutingSection streams={streamStates} onSave={saveStreamRouting} />
        </SectionCard>
      )}
    </div>
  );
}
