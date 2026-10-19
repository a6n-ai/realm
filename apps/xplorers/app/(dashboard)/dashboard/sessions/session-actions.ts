"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { fromZonedLocal } from "@/lib/sessions/timezone";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";

const PATH = "/dashboard/sessions";

export type ScheduleFormState = { error?: string };

export async function scheduleSessionAction(_prev: ScheduleFormState, formData: FormData): Promise<ScheduleFormState> {
  await requirePermission({ studioSession: ["create"] });
  const classPublicId = String(formData.get("classPublicId") ?? "");
  const occursOn = String(formData.get("occursOn") ?? "");
  try {
    await studioSessionsService.scheduleSession(classPublicId, occursOn);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(PATH);
  revalidatePath("/dashboard/classes");
  revalidatePath("/whats-on");
  revalidatePath("/");
  redirect(`${PATH}?month=${occursOn.slice(0, 7)}`);
}

export async function unscheduleSessionAction(publicId: string): Promise<{ error?: string }> {
  await requirePermission({ studioSession: ["update"] });
  let occursOn: string;
  try {
    occursOn = await studioSessionsService.unscheduleSession(publicId);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
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

export type SessionEditState = { error?: string; ok?: boolean };

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
      prices: pricesRaw ? JSON.parse(pricesRaw) : null,
      confirm,
    });
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  touch();
  return { ok: true };
}

export async function cancelSessionAction(publicId: string, confirm: boolean): Promise<{ error?: string; cancelled?: number }> {
  await requirePermission({ studioSession: ["update"] });
  try {
    const { cancelledBookings } = await studioSessionsService.cancelSession(publicId, { confirm });
    touch();
    return { cancelled: cancelledBookings };
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
}

export async function copyWeekAction(fromMonday: string, toMonday: string): Promise<{ error?: string; copied?: number }> {
  await requirePermission({ studioSession: ["create"] });
  try {
    const { copied } = await studioSessionsService.copyWeek(fromMonday, toMonday);
    touch();
    return { copied };
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
}
