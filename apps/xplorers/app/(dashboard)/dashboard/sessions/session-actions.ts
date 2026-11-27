"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ValidationError } from "@foundry/commons";
import { attempt } from "@/lib/actions/guard";
import { requirePermission } from "@/lib/auth/guards";
import { fromZonedLocal } from "@/lib/sessions/timezone";
import { NeedsConfirmError, studioSessionsService } from "@/lib/services/studio-sessions.service";

const PATH = "/dashboard/sessions";

export type ScheduleFormState = { error?: string };

export async function scheduleSessionAction(_prev: ScheduleFormState, formData: FormData): Promise<ScheduleFormState> {
  const classPublicId = String(formData.get("classPublicId") ?? "");
  const occursOn = String(formData.get("occursOn") ?? "");
  const r = await attempt(async () => {
    await requirePermission({ studioSession: ["create"] });
    return studioSessionsService.scheduleSession(classPublicId, occursOn);
  });
  if ("error" in r) return r;
  revalidatePath(PATH);
  revalidatePath("/dashboard/classes");
  revalidatePath("/whats-on");
  revalidatePath("/");
  redirect(`${PATH}?month=${occursOn.slice(0, 7)}`);
}

export async function unscheduleSessionAction(publicId: string): Promise<{ error?: string }> {
  const r = await attempt(async () => {
    await requirePermission({ studioSession: ["update"] });
    return studioSessionsService.unscheduleSession(publicId);
  });
  if ("error" in r) return r;
  const occursOn = r.value;
  revalidatePath(PATH);
  revalidatePath("/dashboard/classes");
  revalidatePath("/whats-on");
  revalidatePath("/");
  redirect(`${PATH}?month=${occursOn.slice(0, 7)}`);
}

function touch() {
  revalidatePath(PATH);
  revalidatePath("/dashboard/classes");
  revalidatePath("/whats-on");
  revalidatePath("/");
}

function parsePrices(raw: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError("Prices could not be read.");
  }
}

export type SessionEditState = { error?: string; ok?: boolean; needsConfirm?: boolean };

export async function updateSessionAction(
  publicId: string,
  confirm: boolean,
  _prev: SessionEditState,
  formData: FormData,
): Promise<SessionEditState> {
  await requirePermission({ studioSession: ["update"] });
  try {
    const zone = await studioSessionsService.timezone();
    const start = String(formData.get("startsAt") ?? "");
    const end = String(formData.get("endsAt") ?? "");
    const pricesRaw = String(formData.get("prices") ?? "");
    await studioSessionsService.updateSession(publicId, {
      occursOn: String(formData.get("occursOn") ?? ""),
      startsAt: start ? fromZonedLocal(start, zone) : undefined,
      endsAt: end ? fromZonedLocal(end, zone) : undefined,
      capacity: Number(formData.get("capacity")),
      prices: parsePrices(pricesRaw),
      confirm,
    });
  } catch (err) {
    if (err instanceof NeedsConfirmError) return { error: err.message, needsConfirm: true };
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  touch();
  return { ok: true };
}

export async function cancelSessionAction(publicId: string, confirm: boolean): Promise<{ error?: string; cancelled?: number }> {
  const r = await attempt(async () => {
    await requirePermission({ studioSession: ["update"] });
    const { cancelledBookings } = await studioSessionsService.cancelSession(publicId, { confirm });
    touch();
    return { cancelled: cancelledBookings };
  });
  return "error" in r ? r : r.value;
}

export async function copyWeekAction(fromMonday: string, toMonday: string): Promise<{ error?: string; copied?: number }> {
  const r = await attempt(async () => {
    await requirePermission({ studioSession: ["create"] });
    const { copied } = await studioSessionsService.copyWeek(fromMonday, toMonday);
    touch();
    return { copied };
  });
  return "error" in r ? r : r.value;
}
