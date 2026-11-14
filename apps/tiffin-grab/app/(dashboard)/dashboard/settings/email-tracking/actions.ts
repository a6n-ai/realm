"use server";

import { createLogger } from "@foundry/commons/logger";
import { ValidationError } from "@foundry/commons";
import { sesEventSettings } from "@relay/email";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { emailStreams } from "@/lib/email/provider";
import { parseRoutingInput } from "@/lib/email/routing-input";
import { setTrackedEmailEvents } from "@/lib/notifications/tracked-email-events";
import { NOTIFICATION_EVENTS, eventCategory } from "@/lib/notifications/events";

const OPTS = { guard: "admin", revalidate: ["/dashboard/settings/email-tracking"] } as const;
const log = createLogger("email-events");
// SES / AWS errors can carry ARNs and account ids, so the admin sees this instead.
const SAFE_ERROR = "Couldn't save — SES rejected the change. Try again or check logs.";

export async function saveTrackedTypes(events: string[]): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    try {
      await setTrackedEmailEvents(events.filter((e) => NOTIFICATION_EVENTS.includes(e) && eventCategory(e) !== "account"));
    } catch (e) {
      log.error({ err: e }, "saveTrackedTypes failed");
      throw new ValidationError(SAFE_ERROR);
    }
  });
}

export async function saveStreamRouting(streamId: string, routing: unknown): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    const stream = emailStreams().find((s) => s.id === streamId);
    if (!stream) throw new ValidationError("Unknown stream");
    const parsed = parseRoutingInput(routing);
    if (!parsed) throw new ValidationError("Invalid routing");
    try {
      await sesEventSettings().setRouting(stream, parsed);
    } catch (e) {
      log.error({ err: e }, "saveStreamRouting failed");
      throw new ValidationError(SAFE_ERROR);
    }
  });
}
