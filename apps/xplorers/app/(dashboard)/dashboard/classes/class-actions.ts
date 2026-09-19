"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { studioSessionsService } from "@/lib/services/studio-sessions.service";

const PATH = "/dashboard/classes";

export type ClassFormState = { error?: string };

function formFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    description: String(formData.get("description") ?? ""),
    startsAt: String(formData.get("startsAt") ?? ""),
    endsAt: String(formData.get("endsAt") ?? ""),
    audience: String(formData.get("audience") ?? ""),
    capacity: Number(formData.get("capacity")),
    priceDisplay: String(formData.get("priceDisplay") ?? ""),
    priceAmount: String(formData.get("priceAmount") ?? "0"),
    location: String(formData.get("location") ?? ""),
    attendanceMode: String(formData.get("attendanceMode") ?? "either"),
    published: formData.get("published") === "on",
    photos: formData.getAll("photos").map((value) => String(value)),
  };
}

export async function createClassAction(_prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  await requirePermission({ studioSession: ["create"] });
  let publicId: string;
  try {
    const timeZone = await studioSessionsService.timezone();
    const row = await studioSessionsService.createClass(formFields(formData), timeZone);
    publicId = row.publicId;
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(PATH);
  revalidatePath("/dashboard/sessions");
  revalidatePath("/whats-on");
  revalidatePath("/");
  redirect(`${PATH}/${publicId}`);
}

export async function updateClassAction(
  publicId: string,
  _prev: ClassFormState,
  formData: FormData,
): Promise<ClassFormState> {
  await requirePermission({ studioSession: ["update"] });
  try {
    const timeZone = await studioSessionsService.timezone();
    await studioSessionsService.updateClass(publicId, formFields(formData), timeZone);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${publicId}`);
  revalidatePath("/dashboard/sessions");
  revalidatePath("/whats-on");
  revalidatePath("/");
  redirect(`${PATH}/${publicId}`);
}

export async function setClassPublished(publicId: string, published: boolean): Promise<void> {
  await requirePermission({ studioSession: ["update"] });
  await studioSessionsService.setPublished(publicId, published);
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${publicId}`);
  revalidatePath("/dashboard/sessions");
  revalidatePath("/whats-on");
  revalidatePath("/");
}

export async function archiveClassAction(publicId: string): Promise<void> {
  await requirePermission({ studioSession: ["update"] });
  await studioSessionsService.archive(publicId);
  revalidatePath(PATH);
  revalidatePath("/dashboard/sessions");
  revalidatePath("/whats-on");
  revalidatePath("/");
  redirect(PATH);
}
