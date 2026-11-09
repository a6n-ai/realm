"use server";

import { revalidatePath } from "next/cache";
import { createLogger } from "@foundry/commons/logger";
import { sesEventSettings } from "@relay/email";
import { requireAdmin } from "@/lib/auth/guards";
import { emailStreams } from "@/lib/email/provider";
import { parseRoutingInput } from "@/lib/email/routing-input";
import { setTrackedEmailEvents } from "@/lib/services/app-settings.service";
import { eventCategory } from "@/lib/notifications/event-categories";
import { NOTIFICATION_EVENTS } from "@/lib/notifications/events";

const PATH = "/dashboard/settings/email-tracking";
const log = createLogger("email-events");
const SAFE_ERROR = "Couldn't save — SES rejected the change. Try again or check logs.";

export async function saveTrackedTypes(events: string[]): Promise<{ error?: string }> {
  await requireAdmin();
  if (!Array.isArray(events) || events.some((e) => typeof e !== "string")) return { error: "Invalid event list" };
  try {
    await setTrackedEmailEvents(events.filter((e) => NOTIFICATION_EVENTS.includes(e) && eventCategory(e) !== "account"));
  } catch (e) {
    log.error({ err: e }, "saveTrackedTypes failed");
    return { error: SAFE_ERROR };
  }
  revalidatePath(PATH);
  return {};
}

export async function saveStreamRouting(streamId: string, routing: unknown): Promise<{ error?: string }> {
  await requireAdmin();
  const stream = emailStreams().find((s) => s.id === streamId);
  if (!stream) return { error: "Unknown stream" };
  const parsed = parseRoutingInput(routing);
  if (!parsed) return { error: "Invalid routing" };
  try {
    await sesEventSettings().setRouting(stream, parsed);
  } catch (e) {
    log.error({ err: e }, "saveStreamRouting failed");
    return { error: SAFE_ERROR };
  }
  revalidatePath(PATH);
  return {};
}
