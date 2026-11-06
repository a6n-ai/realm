import { Suspense } from "react";
import { sesEventSettings } from "@relay/email";
import { EmailEventsSettings, type EmailTypeRow, type StreamState } from "@relay/engine/ui/email-events-settings";
import { eventLabel } from "@relay/engine/ui/template-status";
import { appEvent } from "@/db/schema";
import { SectionCard } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { emailStreams } from "@/lib/email/provider";
import { CATEGORY_LABEL, eventCategory } from "@/lib/notifications/event-categories";
import { emailVolumeByStream } from "@/lib/notifications/email-volume";
import { getTrackedEmailEvents } from "@/lib/services/app-settings.service";
import { saveStreamRouting, saveTrackedTypes } from "./actions";

export default function EmailEventsPage() {
  return (
    <SectionCard title="Email events" subtitle="Choose which emails are tracked and which SES events reach the app.">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading email event settings…</p>}>
        <EmailEventsData />
      </Suspense>
    </SectionCard>
  );
}

async function EmailEventsData() {
  await requireAdmin();
  const streams = emailStreams();
  const provider = sesEventSettings();
  const [tracked, volume, states] = await Promise.all([
    getTrackedEmailEvents(),
    emailVolumeByStream(streams),
    Promise.all(
      streams.map(async (stream): Promise<Omit<StreamState, "volume">> => {
        try {
          return { stream, routing: await provider.getRouting(stream) };
        } catch (e) {
          return {
            stream,
            routing: { webhook: [], counts: null },
            error: e instanceof Error && e.message ? e.message : "Could not read this stream from SES.",
          };
        }
      }),
    ),
  ]);

  const trackedSet = new Set(tracked);
  const types: EmailTypeRow[] = appEvent.enumValues
    .filter((e) => e !== "manual_adjustment")
    .map((event) => {
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

  return (
    <EmailEventsSettings
      types={types}
      streams={states.map((s) => ({ ...s, volume: volume[s.stream.id] ?? {} }))}
      onSaveTypes={saveTrackedTypes}
      onSaveStream={saveStreamRouting}
    />
  );
}
