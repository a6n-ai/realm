"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { fromZonedLocal } from "@/lib/sessions/timezone";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";

const PATH = "/dashboard/sessions";

export type SessionFormState = { error?: string };

function formFields(formData: FormData, timeZone: string) {
  return {
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    description: String(formData.get("description") ?? ""),
    startsAt: fromZonedLocal(String(formData.get("startsAt") ?? ""), timeZone),
    endsAt: fromZonedLocal(String(formData.get("endsAt") ?? ""), timeZone),
    audience: String(formData.get("audience") ?? ""),
    capacity: Number(formData.get("capacity")),
    priceDisplay: String(formData.get("priceDisplay") ?? ""),
    location: String(formData.get("location") ?? ""),
    attendanceMode: String(formData.get("attendanceMode") ?? "either"),
    published: formData.get("published") === "on",
  };
}

export async function createSessionAction(_prev: SessionFormState, formData: FormData): Promise<SessionFormState> {
  await requirePermission({ studioSession: ["create"] });
  try {
    const timeZone = await studioSessionsService.timezone();
    await studioSessionsService.createSession(formFields(formData, timeZone));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(PATH);
  revalidatePath("/whats-on");
  revalidatePath("/");
  redirect(PATH);
}

export async function updateSessionAction(
  publicId: string,
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  await requirePermission({ studioSession: ["update"] });
  try {
    const timeZone = await studioSessionsService.timezone();
    await studioSessionsService.updateSession(publicId, formFields(formData, timeZone));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${publicId}`);
  revalidatePath("/whats-on");
  revalidatePath("/");
  redirect(PATH);
}

export async function setSessionPublished(publicId: string, published: boolean): Promise<void> {
  await requirePermission({ studioSession: ["update"] });
  await studioSessionsService.setPublished(publicId, published);
  revalidatePath(PATH);
  revalidatePath("/whats-on");
  revalidatePath("/");
}

export async function archiveSessionAction(publicId: string): Promise<void> {
  await requirePermission({ studioSession: ["update"] });
  await studioSessionsService.archive(publicId);
  revalidatePath(PATH);
  revalidatePath("/whats-on");
  revalidatePath("/");
  redirect(PATH);
}
