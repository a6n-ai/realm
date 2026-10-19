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
    capacity: Number(formData.get("capacity")),
    location: String(formData.get("location") ?? ""),
    attendanceMode: String(formData.get("attendanceMode") ?? "either"),
    published: formData.get("published") === "on",
    photos: formData.getAll("photos").map((value) => String(value)),
    included: String(formData.get("included") ?? ""),
    scheduleLine: String(formData.get("scheduleLine") ?? ""),
    groupSize: String(formData.get("groupSize") ?? ""),
    ageMin: String(formData.get("ageMin") ?? ""),
    ageMax: String(formData.get("ageMax") ?? ""),
    ageWaiver: formData.get("ageWaiver") === "on",
    color: String(formData.get("color") ?? "pink"),
    bookingType: String(formData.get("bookingType") ?? "bookable"),
    pricing: String(formData.get("pricing") ?? ""),
    prices: String(formData.get("prices") ?? ""),
    pattern: String(formData.get("pattern") ?? "null"),
  };
}

export async function createClassAction(_prev: ClassFormState, formData: FormData): Promise<ClassFormState> {
  await requirePermission({ studioSession: ["create"] });
  let publicId: string;
  try {
    const row = await studioSessionsService.createClass(formFields(formData));
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
    await studioSessionsService.updateClass(publicId, formFields(formData));
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
