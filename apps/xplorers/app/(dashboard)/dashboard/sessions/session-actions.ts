"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
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
