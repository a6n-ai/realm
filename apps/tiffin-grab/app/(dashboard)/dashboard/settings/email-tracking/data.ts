import "server-only";
import { createLogger } from "@foundry/commons/logger";
import { sesEventSettings } from "@relay/email";
import { eventLabel } from "@relay/engine/ui/template-status";
import { requireAdmin } from "@/lib/auth/guards";
import { emailStreams } from "@/lib/email/provider";
import { CATEGORY_LABEL } from "@/lib/notifications/event-categories";
import { NOTIFICATION_EVENTS, eventCategory } from "@/lib/notifications/events";
import { emailVolumeByStream } from "@/lib/notifications/email-volume";
import { getTrackedEmailEvents } from "@/lib/notifications/tracked-email-events";
import type { EmailTypeRow } from "./email-tracking-section";
import type { StreamState } from "./ses-routing-section";

const log = createLogger("email-events-page");

export const trackingAvailable = () => emailStreams().some((s) => s.kind === "tracked");

/** null when the setting couldn't be read. */
export async function loadEmailTypes(): Promise<EmailTypeRow[] | null> {
  await requireAdmin();
  const tracked = await getTrackedEmailEvents().catch((e) => {
    log.error({ err: e }, "getTrackedEmailEvents failed");
    return null;
  });
  if (tracked === null) return null;
  const trackedSet = new Set(tracked);
  return NOTIFICATION_EVENTS.map((event) => {
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
}

export async function loadStreams(): Promise<StreamState[]> {
  await requireAdmin();
  const streams = emailStreams();
  const provider = sesEventSettings();
  const [volume, states] = await Promise.all([
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
          return { stream, routing: { webhook: [], counts: null }, error: "Couldn't load this stream's settings." };
        }
      }),
    ),
  ]);
  return states.map((s) => ({ ...s, volume: volume[s.stream.id] ?? {} }));
}
