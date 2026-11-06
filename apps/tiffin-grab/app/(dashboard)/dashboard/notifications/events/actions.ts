"use server";

import { revalidatePath } from "next/cache";
import { sesEventSettings } from "@relay/email";
import { requireAdmin } from "@/lib/auth/guards";
import { emailStreams } from "@/lib/email/provider";
import { parseRoutingInput } from "@/lib/email/routing-input";
import { setTrackedEmailEvents } from "@/lib/services/app-settings.service";
import { eventCategory } from "@/lib/notifications/event-categories";

const PATH = "/dashboard/notifications/events";
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export async function saveTrackedTypes(events: string[]): Promise<{ error?: string }> {
  await requireAdmin();
  if (!Array.isArray(events) || events.some((e) => typeof e !== "string")) return { error: "Invalid event list" };
  try {
    await setTrackedEmailEvents(events.filter((e) => eventCategory(e) !== "account"));
  } catch (e) {
    return { error: message(e, "Could not save tracked emails") };
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
    return { error: message(e, "Could not update SES. Check the IAM permissions for this stream.") };
  }
  revalidatePath(PATH);
  return {};
}
